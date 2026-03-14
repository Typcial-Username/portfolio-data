import fs from "node:fs"
import { toJSONSchema } from "zod"
import { ProjectSchema } from "../schema/projects.schema"

const jsonSchema = toJSONSchema(ProjectSchema)

fs.writeFileSync("schema/project.schema.json", JSON.stringify(jsonSchema, null, 2))

console.log("JSON schema generated ✅")