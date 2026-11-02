import {
  RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand,
  CommitTransactionCommand, RollbackTransactionCommand,
  type ExecuteStatementCommandInput, type ExecuteStatementCommandOutput,
  type Field, type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { randomBytes } from "node:crypto";
import { JsonParameter, UuidParameter, type SqlDatabase, type SqlTransaction } from "./sql";

export interface AuroraDataApiOptions {
  region: string; resourceArn: string; secretArn: string; database: string;
  /** Tests inject a transport, never real credentials. */
  client?: Pick<RDSDataClient, "send">;
  maxResultBytes?: number;
}
export class AuroraDataError extends Error {
  constructor(message: string, public code = "AWS_DATA_UNAVAILABLE", cause?: unknown) { super(message, {cause}); this.name = "AuroraDataError"; }
}

/** Only explicitly cancelled or throttle-rejected requests can be replayed. */
export async function retryRejectedDataRequest<T>(operation: () => Promise<T>, wait: (milliseconds:number)=>Promise<void> = milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)), random:()=>number = Math.random): Promise<T> {
  const delays=[2000,3000,5000,8000,12000,15000];
  let resumeAttempt=0,throttleAttempt=0;
  for(;;)try{return await operation();}catch(error){
    const name=(error as {name?:string}).name;
    // These responses explicitly reject/cancel a request before execution.
    // Network/timeout/commit failures can have unknown outcomes and are not replayed.
    if(name==="DatabaseResumingException"&&resumeAttempt<delays.length){await wait(delays[resumeAttempt++]);continue;}
    if((name==="ThrottlingException"||name==="TooManyRequestsException")&&throttleAttempt<5){
      const ceiling=Math.min(8000,1000*2**throttleAttempt++);
      await wait(Math.floor(random()*ceiling));continue;
    }
    throw error;
  }
}

function pgArray(values: unknown[]): string {
  return `{${values.map(value => value === null ? "NULL" : Array.isArray(value) ? pgArray(value) : `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}

/** Lexical conversion leaves literals, quoted names, comments and dollar strings intact. */
export function compileStatement(sql: string, values: unknown[] = []) {
  const parameters = new Map<number, SqlParameter>();
  let output = "", i = 0, returnsRows = false;
  while (i < sql.length) {
    const tail = sql.slice(i);
    if (tail.startsWith("--")) { const end = sql.indexOf("\n", i); const stop = end < 0 ? sql.length : end + 1; output += sql.slice(i, stop); i = stop; continue; }
    if (tail.startsWith("/*")) {
      let level = 1, end = i + 2;
      while (end < sql.length && level) { if (sql.startsWith("/*", end)) { level++; end += 2; } else if (sql.startsWith("*/", end)) { level--; end += 2; } else end++; }
      if (level) throw new AuroraDataError("An SQL comment was not closed.", "DATA_QUERY_INVALID");
      output += sql.slice(i, end); i = end; continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i], start = i++;
      while (i < sql.length) { if (sql[i++] === quote) { if (sql[i] === quote) { i++; continue; } break; } }
      output += sql.slice(start, i); continue;
    }
    const dollar = tail.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) { const end = sql.indexOf(dollar, i + dollar.length); if (end < 0) throw new AuroraDataError("An SQL body was not closed.", "DATA_QUERY_INVALID"); const stop = end + dollar.length; output += sql.slice(i, stop); i = stop; continue; }
    const match = tail.match(/^\$(\d+)/);
    if (match) {
      const index = Number(match[1]), value = values[index - 1];
      if (index < 1 || index > values.length || value === undefined) throw new AuroraDataError("An SQL parameter is missing.", "DATA_QUERY_INVALID");
      const name = `p${index}`, vector = /^\s*::\s*vector\b/i.test(tail.slice(match[0].length));
      let parameter: SqlParameter;
      if (value === null) parameter = { name, value: { isNull: true } };
      else if (value instanceof JsonParameter) parameter = { name, value: { stringValue: value.text } };
      else if (value instanceof UuidParameter) parameter = {name,typeHint:"UUID",value:{stringValue:value.text}};
      else if (typeof value === "boolean") parameter = { name, value: { booleanValue: value } };
      else if (typeof value === "number") {
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new AuroraDataError("An SQL number is outside the supported range.", "DATA_QUERY_INVALID");
        parameter = { name, value: Number.isInteger(value) ? { longValue: value } : { doubleValue: value } };
      } else if (typeof value === "string") parameter = { name, value: { stringValue: value } };
      else if (Array.isArray(value)) parameter = { name, value: { stringValue: pgArray(value) } };
      else throw new AuroraDataError("An SQL parameter has an unsupported type.", "DATA_QUERY_INVALID");
      parameters.set(index, parameter);
      let expression = value instanceof JsonParameter && !vector ? `CAST(:${name} AS jsonb)` : `:${name}`;
      let castLength=0;
      for (;;) {
        const cast=tail.slice(match[0].length+castLength).match(/^\s*::\s*((?:double\s+precision)|(?:[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?))(\[\])?/i);
        if(!cast)break;
        expression=`CAST(${expression} AS ${cast[1]}${cast[2]??""})`;castLength+=cast[0].length;
      }
      output += expression;
      i += match[0].length+castLength; continue;
    }
    if(/^RETURNING\b/i.test(tail)&&(i===0||!/[A-Za-z0-9_]/.test(sql[i-1])))returnsRows=true;
    output += sql[i++];
  }
  return { sql: output.replace(/;\s*$/, ""), parameters: [...parameters.values()],returnsRows };
}

function value(field: Field, type?: string): unknown {
  if (field.isNull) return null;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.longValue !== undefined) { if (!Number.isSafeInteger(field.longValue)) throw new AuroraDataError("A database integer exceeds JavaScript precision.", "DATA_NUMBER_RANGE"); return field.longValue; }
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.stringValue !== undefined) {
    if (type === "json" || type === "jsonb") return JSON.parse(field.stringValue);
    if (/^(int2|int4|int8|numeric|float4|float8)$/.test(type ?? "")) {
      const number = Number(field.stringValue);
      if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) throw new AuroraDataError("A database number exceeds JavaScript precision.", "DATA_NUMBER_RANGE");
      return number;
    }
    return field.stringValue;
  }
  if (field.blobValue) return field.blobValue;
  throw new AuroraDataError("The database returned an unsupported value.", "DATA_RESULT_UNSUPPORTED");
}
function rows<T>(output: ExecuteStatementCommandOutput): T[] {
  return (output.records ?? []).map(record => Object.fromEntries(record.map((field, i) => [output.columnMetadata?.[i]?.name ?? String(i), value(field, output.columnMetadata?.[i]?.typeName)])) as T);
}
function safeError(error: unknown): Error {
  if (error instanceof AuroraDataError) return error;
  const message = error instanceof Error ? error.message : "";
  const driverCode = (error as {code?:unknown})?.code;
  const code = /SQLState:\s*([A-Z0-9]{5})/i.exec(message)?.[1] ?? (typeof driverCode === "string" && /^[A-Z0-9]{5}$/.test(driverCode) ? driverCode : undefined);
  if (code) return new AuroraDataError("The database rejected this operation.", code, error);
  return new AuroraDataError("The AWS database request could not finish. Check connectivity and the configured access role.", "AWS_DATA_UNAVAILABLE", error);
}

type Piece = {r:string;n:string;j:string};
function parseRow<T>(text: string): T {
  return JSON.parse(text,(_key,value)=>{
    if(typeof value==="number"&&(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value))))throw new AuroraDataError("A database number exceeds JavaScript precision.","DATA_NUMBER_RANGE");
    return value;
  }) as T;
}
function readProjection(sql: string) {
  return `WITH __further_rows AS MATERIALIZED (${sql}), __further_numbered AS (
    SELECT row_number() OVER () AS r, row_to_json(q)::text AS j FROM __further_rows q)
    SELECT r::text AS r,parts.part_number::text AS n,substring(j FROM parts.part_number*4096+1 FOR 4096) AS j
    FROM __further_numbered CROSS JOIN LATERAL generate_series(0,GREATEST(0,(length(j)-1)/4096)) AS parts(part_number)
    ORDER BY __further_numbered.r,parts.part_number`;
}
function collectPieces<T>(maxBytes: number) {
  const assembled: T[]=[];
  let currentRow: string | undefined,pieces="",next=0,totalBytes=0;
  return {
    push(page: Piece[]) {
      for (const part of page) {
        totalBytes+=Buffer.byteLength(part.j);
        if(totalBytes>maxBytes)throw new AuroraDataError("This database result is too large. Request a smaller page or branch.","DATA_RESPONSE_LIMIT");
        if(currentRow!==undefined&&part.r!==currentRow){assembled.push(parseRow<T>(pieces));pieces="";next=0;}
        if(Number(part.n)!==next++)throw new AuroraDataError("The database response was incomplete.","DATA_RESULT_INCOMPLETE");
        currentRow=part.r;pieces+=part.j;
      }
    },
    finish(){if(currentRow!==undefined)assembled.push(parseRow<T>(pieces));return {rows:assembled};},
  };
}

/** Data API has no persistent public database socket and never returns its secret. */
export function createAuroraDataApiDatabase(options: AuroraDataApiOptions): SqlDatabase {
  if (!options.region || !/^arn:aws(?:-[a-z]+)?:rds:/.test(options.resourceArn) || !/^arn:aws(?:-[a-z]+)?:secretsmanager:/.test(options.secretArn) || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(options.database)) throw new AuroraDataError("Aurora Data API configuration is incomplete.", "AWS_DATA_CONFIGURATION");
  // Execute/commit can have an uncertain outcome after a network failure.
  // Only explicit not-executed resume/throttling responses are retried below.
  const client = options.client ?? new RDSDataClient({ region: options.region, maxAttempts: 1 });
  const common = { resourceArn: options.resourceArn, secretArn: options.secretArn, database: options.database };
  const maxResultBytes = options.maxResultBytes ?? 32 * 1024 * 1024;
  async function execute(input: Omit<ExecuteStatementCommandInput, "resourceArn" | "secretArn">) {
    try { return await retryRejectedDataRequest(()=>client.send(new ExecuteStatementCommand({ ...common, ...input, includeResultMetadata: true, resultSetOptions: { longReturnType: "STRING", decimalReturnType: "STRING" } }))); }
    catch (error) { throw safeError(error); }
  }
  async function transaction<T>(callback: (tx: SqlTransaction) => Promise<T>) {
    let transactionId: string | undefined;
    let tx: ReturnType<typeof port> | undefined;
    try {
      transactionId = (await retryRejectedDataRequest(()=>client.send(new BeginTransactionCommand(common))).catch(error=>{throw safeError(error);})).transactionId;
      if (!transactionId) throw new AuroraDataError("AWS did not open a database transaction.");
      tx=port(transactionId);
      const result = await callback(tx);
      await tx.settle();
      await retryRejectedDataRequest(()=>client.send(new CommitTransactionCommand({ ...common, transactionId }))).catch(error=>{throw safeError(error);});
      return result;
    } catch (error) {
      await tx?.settle().catch(()=>undefined);
      if (transactionId) try { await retryRejectedDataRequest(()=>client.send(new RollbackTransactionCommand({ ...common, transactionId }))); } catch { /* Preserve the original failure; lease/idempotency recovery owns uncertain results. */ }
      // execute/begin/commit sanitize SDK failures at their boundary. Preserve
      // deliberate domain validation errors raised by the caller after rollback.
      throw error;
    }
  }
  async function read<T>(wrapped: string, parameters: SqlParameter[], transactionId: string) {
    // A single server cursor freezes row order and snapshot. Split large rows
    // into <=4K-character pieces before Data API serialization, then FETCH bounded
    // pages. Even multibyte text stays below 64KiB/row and 1MiB/response.
    const cursor = `further_${randomBytes(10).toString("hex")}`;
    await execute({ sql: `DECLARE "${cursor}" NO SCROLL CURSOR FOR ${wrapped}`, parameters, transactionId });
    const collector=collectPieces<T>(maxResultBytes);
    try {
      for (;;) {
        const page = rows<Piece>(await execute({ sql: `FETCH FORWARD 16 FROM "${cursor}"`, transactionId }));
        if (!page.length) break;
        collector.push(page);
      }
      return collector.finish();
    } finally { await execute({ sql: `CLOSE "${cursor}"`, transactionId }).catch(()=>undefined); }
  }
  function port(transactionId?: string): SqlTransaction & {settle():Promise<unknown>} {
    const direct: SqlTransaction & {settle():Promise<unknown>} = {
      async settle(){},
      async query<T>(statement: string, values?: unknown[]) {
        const compiled = compileStatement(statement, values);
        // SELECT/CTE reads use cursor paging.
        if (/^\s*(SELECT|WITH)\b/i.test(compiled.sql)) {
          const wrapped=readProjection(compiled.sql);
          const first=rows<Piece>(await execute({sql:wrapped+" LIMIT 17",parameters:compiled.parameters,transactionId}));
          // Most reads fit one request. The extra fragment is an overflow marker,
          // never a truncated success; larger reads restart in one server cursor.
          if(first.length<17){const collector=collectPieces<T>(maxResultBytes);collector.push(first);return collector.finish();}
          if (transactionId) return read<T>(wrapped, compiled.parameters, transactionId);
          return transaction(tx => tx.query<T>(statement, values));
        }
        if(compiled.returnsRows){
          // PostgreSQL arrays/UUID[] and extension values can be unsupported
          // native Data API result types. Serialize mutation rows inside PG,
          // once, retaining the exact mutation and its RETURNING semantics.
          const output=await execute({sql:readProjection(compiled.sql),parameters:compiled.parameters,transactionId});
          const collector=collectPieces<T>(maxResultBytes);collector.push(rows<Piece>(output));
          const result=collector.finish();return {...result,affectedRows:result.rows.length};
        }
        const output = await execute({ sql:compiled.sql,parameters:compiled.parameters, transactionId });
        return { rows: rows<T>(output), affectedRows: output.numberOfRecordsUpdated };
      },
      async exec(sql: string) {
        // Migrations contain multiple DDL statements; Data API accepts one at a
        // time. The splitter preserves comments and quoted/dollar-quoted bodies.
        for (const statement of splitStatements(sql)) await execute({ sql: statement, transactionId });
      },
    };
    if (!transactionId) return direct;
    // Data API rejects overlapping requests with the same transaction ID.
    // Queue only this transaction; independent requests/transactions stay parallel.
    let previous: Promise<unknown> = Promise.resolve();
    function serialized<T>(operation: () => Promise<T>): Promise<T> {
      const current=previous.then(operation);
      previous=current;
      return current;
    }
    return {
      query: <T>(statement: string, values?: unknown[]) => serialized(()=>direct.query<T>(statement,values)),
      exec: (statement: string) => serialized(()=>direct.exec(statement)),
      settle:()=>previous,
    };
  }
  return { ...port(), transaction, async close() { if (!options.client) (client as RDSDataClient).destroy(); } };
}

/** Split SQL scripts without splitting inside literals, comments or DO blocks. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "", quote: string | null = null, dollar: string | null = null, block = 0, line = false, hasCode=false;
  for (let i=0;i<sql.length;i++) {
    const c=sql[i], next=sql[i+1]; current+=c;
    if (line) { if(c==="\n")line=false; continue; }
    if (block) { if(c==="/"&&next==="*"){block++;current+=next;i++;}else if(c==="*"&&next==="/"){block--;current+=next;i++;}continue; }
    if(dollar){if(sql.startsWith(dollar,i)){current+=dollar.slice(1);i+=dollar.length-1;dollar=null;}continue;}
    if(quote){if(c===quote){if(next===quote){current+=next;i++;}else quote=null;}continue;}
    if(c==="-"&&next==="-"){line=true;current+=next;i++;continue;}
    if(c==="/"&&next==="*"){block=1;current+=next;i++;continue;}
    if(c==="'"||c==='"'){hasCode=true;quote=c;continue;}
    if(c==="$"){const match=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];if(match){hasCode=true;dollar=match;current+=match.slice(1);i+=match.length-1;continue;}}
    if(c===";"){if(hasCode)statements.push(current.slice(0,-1).trim());current="";hasCode=false;}
    else if(!/\s/.test(c))hasCode=true;
  }
  if(quote||dollar||block)throw new AuroraDataError("A migration statement was not closed.","DATA_QUERY_INVALID");
  if(hasCode)statements.push(current.trim());return statements;
}

export function auroraDataApiFromEnvironment() {
  return createAuroraDataApiDatabase({region:process.env.AWS_REGION ?? "us-east-1", resourceArn:process.env.FURTHER_AURORA_RESOURCE_ARN ?? "", secretArn:process.env.FURTHER_AURORA_SECRET_ARN ?? "", database:process.env.FURTHER_AURORA_DATABASE ?? "further"});
}
