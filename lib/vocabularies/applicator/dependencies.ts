import {CodeKeywordDefinition, SchemaMap} from "../../types"
import KeywordCtx from "../../compile/context"
import {alwaysValidSchema, propertyInData} from "../util"
import {applySubschema} from "../../compile/subschema"
import {checkReportMissingProp, checkMissingProp, reportMissingProp} from "../missing"
import {_, str} from "../../compile/codegen"

interface PropertyDependencies {
  [x: string]: string[]
}

type SchemaDependencies = SchemaMap

const def: CodeKeywordDefinition = {
  keyword: "dependencies",
  type: "object",
  schemaType: "object",
  code(cxt: KeywordCtx) {
    const {gen, schema, data, it} = cxt
    const [propDeps, schDeps] = splitDependencies()
    const valid = gen.name("valid")
    validatePropertyDeps(propDeps)
    validateSchemaDeps(schDeps)

    function splitDependencies(): [PropertyDependencies, SchemaDependencies] {
      const propertyDeps: PropertyDependencies = {}
      const schemaDeps: SchemaDependencies = {}
      for (const key in schema) {
        if (key === "__proto__") continue
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps
        deps[key] = schema[key]
      }
      return [propertyDeps, schemaDeps]
    }

    function validatePropertyDeps(propertyDeps: {[x: string]: string[]}): void {
      if (Object.keys(propertyDeps).length === 0) return
      const missing = gen.let("missing")
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop]
        if (deps.length === 0) continue
        const hasProperty = propertyInData(data, prop, it.opts.ownProperties)
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", "),
        })
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              checkReportMissingProp(cxt, depProp)
            }
          })
        } else {
          gen.if(_`${hasProperty} && (${checkMissingProp(cxt, deps, missing)})`)
          reportMissingProp(cxt, missing)
          gen.else()
        }
      }
    }

    function validateSchemaDeps(schemaDeps: SchemaMap): void {
      for (const prop in schemaDeps) {
        if (alwaysValidSchema(it, schemaDeps[prop])) continue
        gen.if(
          propertyInData(data, prop, it.opts.ownProperties),
          () => applySubschema(it, {keyword: "dependencies", schemaProp: prop}, valid),
          () => gen.var(valid, true) // TODO var
        )
        cxt.ok(valid)
      }
    }
  },
  error: {
    message: ({params: {property, depsCount, deps}}) => {
      const property_ies = depsCount === 1 ? "property" : "properties"
      return str`should have ${property_ies} ${deps} when property ${property} is present`
    },
    params: ({params: {property, depsCount, deps, missingProperty}}) =>
      _`{property: ${property},
      missingProperty: ${missingProperty},
      depsCount: ${depsCount},
      deps: ${deps}}`, // TODO change to reference?
  },
}

module.exports = def