import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Directory where uploaded / extracted / crawled / generated files will be stored.
 * Note this will vary each time the app is run, but will be consistent within each run.
 */
export const TEMP_FILE_DIR = await mkdtemp(join(tmpdir(), "spec-generator-"));

/**
 * Path under the server root where uploaded/crawled files are served.
 * Currently relied upon specifically by the ReSpec generator.
 */
export const UPLOADS_PATH = "uploads";
