import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const schema = source
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]\n  output = "../../node_modules/.prisma/client"')
  .replace('provider = "sqlite"', 'provider = "postgresql"\n  directUrl = env("DIRECT_URL")');
if (!schema.includes('provider = "postgresql"')) throw new Error("Could not prepare PostgreSQL schema");
mkdirSync(path.join(root, "prisma/postgres"), { recursive: true });
writeFileSync(path.join(root, "prisma/postgres/schema.prisma"), schema);
console.log("PostgreSQL schema prepared from the shared models.");
