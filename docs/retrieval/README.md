# Local retrieval

The sidecar runs on `127.0.0.1:8767`, on CPU with two PyTorch threads. Only the server can call `/embed` using the locally generated token. Browser-origin requests are rejected. `GET /health` reports readiness, model revision and dimensions without exposing secrets.

Model: `FacebookAI/roberta-base`, revision `e2da8e2f811d1448a5b465c236feacd80ffbac7b`, 768 dimensions. The embedding space includes the suffix `mean-mask-l2-v1`: attention-mask mean pooling of the final hidden state followed by L2 normalization. The unused pooler is disabled. Input is capped at 512 tokens and batches at 16 texts. This is a Meta general language encoder, not a trained sentence retriever.

The model card identifies an MIT license. Contriever was evaluated as a possible retriever, but the official repository's CC BY-NC 4.0 license makes it a poor default for a continuing startup. This is an engineering selection, not a legal determination for every future use. Recheck licenses before distributing model weights.

Current indexes: owner-scoped concept descriptions and explicit current intent. Storage also supports resource chunks and selected metadata for future ingestion. PostgreSQL remains the source of truth. Vectors are replaceable derived data with actor, entity type/ID, content hash, model, revision, dimension and timestamp. Search requires exact model/revision equality and owner scope.

`POST /api/local/search` with `{ "query": "..." }` retrieves the current learner's indexed text. `POST /api/local/reindex` rebuilds their concepts/intent after the sidecar was unavailable. Map persistence succeeds independently of indexing and reports a pending-index warning. No raw profile, identity, consent, media bytes or hidden reasoning is indexed.

A November 1 smoke check compared GPU/matrix, SQL/database and yeast/bread queries against related and unrelated passages: all 3 intended passages ranked above distractors. Batch inference took approximately 0.52 seconds on this Mac. Scores were highly concentrated (positive cosines ~0.976–0.983; strongest distractors ~0.953–0.971). This tiny check does not establish production retrieval quality. Do not use an arbitrary cosine threshold to merge concepts, authorize matching, infer mastery or identify people.

Next useful evaluation: a labelled collection of real project concepts, synonyms, ambiguous queries and hard negatives; measure recall@k and wrong-neighbour rate, then choose or fine-tune a suitably licensed Meta encoder. Native pgvector ANN indexes and background reindex jobs are future work.

Sources: [model card](https://huggingface.co/FacebookAI/roberta-base), [Contriever license](https://github.com/facebookresearch/contriever/blob/main/LICENSE), [PGlite extensions](https://pglite.dev/extensions/). Dependencies are pinned in `requirements.lock` and the model revision is checked in the embedding script.
