import assert from "node:assert/strict";
import { clientSchema } from "./prepare-client";

assert.equal(clientSchema(), "prisma/schema.prisma");
assert.equal(clientSchema("file:./dev.db"), "prisma/schema.prisma");
assert.equal(clientSchema("file:/tmp/showroom-test.db"), "prisma/schema.prisma");
assert.equal(clientSchema("postgresql://test@127.0.0.1:1/test"), "prisma/postgres/schema.prisma");
assert.equal(clientSchema("postgres://test@127.0.0.1:1/test"), "prisma/postgres/schema.prisma");
assert.throws(() => clientSchema("mysql://test@127.0.0.1/test"), /DATABASE_URL must use/);
console.log("PASS: SQLite and PostgreSQL client selection; unsupported protocols rejected. No database connections made.");
