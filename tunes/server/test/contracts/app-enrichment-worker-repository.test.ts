// The dedicated PG producers are inert exports. Their portable admission tests
// also belong in the ordinary DB-free CI gate, which excludes integration filenames.
// Importing them here registers only those portable tests, never the PG producers.
import '../explorers-app-enrichment-worker.integration.test';
import '../migrations/app-enrichment-worker-role.integration.test';
