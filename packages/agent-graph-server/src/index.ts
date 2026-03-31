import { createHttpServer } from "./create-http-server.js"
import { createDocumentRepository } from "./document-repository.js"

const repository = await createDocumentRepository()
const server = await createHttpServer(repository)

console.log(`agent-graph server listening on http://localhost:${server.port}`)
