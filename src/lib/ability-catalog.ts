import apiFetch from "@wordpress/api-fetch";
import { createCatalogLoader } from "./abilities";

// per_page=-1 is api-fetch's convention, not a value core accepts: it rewrites
// to 100 and follows the listing's `Link: rel="next"` to the end.
const CATALOG_PATH = "/wp-abilities/v1/abilities?per_page=-1";

export const abilityCatalog = createCatalogLoader(() =>
	apiFetch({ path: CATALOG_PATH }),
);
