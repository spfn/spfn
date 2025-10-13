// @ts-nocheck -- skip type checking
import * as meta_0 from "../content/docs/meta.json?collection=meta&hash=1760360421146"
import * as docs_3 from "../content/docs/installation.mdx?collection=docs&hash=1760360421146"
import * as docs_2 from "../content/docs/index.mdx?collection=docs&hash=1760360421146"
import * as docs_1 from "../content/docs/examples.mdx?collection=docs&hash=1760360421146"
import * as docs_0 from "../content/docs/concepts.mdx?collection=docs&hash=1760360421146"
import { _runtime } from "fumadocs-mdx/runtime/next"
import * as _source from "../source.config"
export const docs = _runtime.doc<typeof _source.docs>([{ info: {"path":"concepts.mdx","fullPath":"content/docs/concepts.mdx"}, data: docs_0 }, { info: {"path":"examples.mdx","fullPath":"content/docs/examples.mdx"}, data: docs_1 }, { info: {"path":"index.mdx","fullPath":"content/docs/index.mdx"}, data: docs_2 }, { info: {"path":"installation.mdx","fullPath":"content/docs/installation.mdx"}, data: docs_3 }]);
export const meta = _runtime.meta<typeof _source.meta>([{ info: {"path":"meta.json","fullPath":"content/docs/meta.json"}, data: meta_0 }]);