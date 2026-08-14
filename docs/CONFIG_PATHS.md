# Canonical configuration paths

`firebase.json` intentionally points at the versioned sources rather than
root-level copies, so there is exactly one file per concern and no chance of a
stale duplicate being deployed:

| Concern | Canonical path |
|---|---|
| Firestore security rules | `firestore/rules/firestore.rules` |
| Firestore indexes + TTL policies | `firestore/indexes/firestore.indexes.json` |
| Cloud Storage security rules | `storage.rules` |
| Cloud Functions source | `backend/functions` |
| Hosting output (generated) | `.firebase/hosting` |

Previously the repository also carried `firestore.rules` and
`firestore.indexes.json` at the root as "aliases". Both contained only `//`
comments — which means the indexes file was **not valid JSON** and the rules file
would have deployed an empty ruleset (deny-all) had anything ever pointed at it.
They have been removed in favour of the single canonical paths above.
