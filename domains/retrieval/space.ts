/** Versioned, browser-safe identity of the local Meta feature space. */
export const EMBEDDING_MODEL = "FacebookAI/roberta-base";
export const EMBEDDING_REFERENCE_HASH = "ec1cadc28166e6bdc48d5248743ddc8c9cea8147f788e82fb02229a1d27588af";
export const EMBEDDING_REVISION = `e2da8e2f811d1448a5b465c236feacd80ffbac7b:mean-mask-l2-refmean-l2-v2:${EMBEDDING_REFERENCE_HASH}`;
export const EMBEDDING_SPACE = { model: EMBEDDING_MODEL, modelRevision: EMBEDDING_REVISION };
export const conceptIndexText = (concept: {title:string;hook:string}) => `${concept.title}. ${concept.hook}`;
