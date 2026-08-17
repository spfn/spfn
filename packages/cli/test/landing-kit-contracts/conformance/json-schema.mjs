/**
 * Dependency-free validator for the JSON Schema subset the Landing Kit I0
 * contracts use.
 *
 * This file is part of the frozen contract set: spfn-course owns it and
 * capabilities and spfn hold byte-identical copies, so all three repositories
 * decide "valid" the same way without a shared package and without adding a
 * dependency to any lockfile.
 *
 * Supported keywords: $ref (local #/$defs/... only), type, const, enum,
 * properties, required, additionalProperties, propertyNames,
 * patternProperties, items, minItems, maxItems, uniqueItems, minimum,
 * maximum, minLength, maxLength, pattern, allOf, anyOf, oneOf.
 * Everything else (title, description, $id, $schema) is annotation and is
 * ignored. A schema that reaches for an unsupported keyword throws rather
 * than silently passing.
 */

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$comment', 'examples', 'default']);

const SUPPORTED = new Set([
    '$ref', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties',
    'propertyNames', 'patternProperties', 'items', 'minItems', 'maxItems', 'uniqueItems',
    'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'allOf', 'anyOf', 'oneOf',
]);

function typeOf(value)
{
    if (value === null)
    {
        return 'null';
    }
    if (Array.isArray(value))
    {
        return 'array';
    }
    if (Number.isInteger(value))
    {
        return 'integer';
    }

    return typeof value;
}

function matchesType(value, expected)
{
    const actual = typeOf(value);
    if (expected === 'number')
    {
        return actual === 'number' || actual === 'integer';
    }

    return actual === expected;
}

function resolveRef(root, ref)
{
    if (!ref.startsWith('#/'))
    {
        throw new Error(`Only local $ref is supported, got "${ref}".`);
    }

    let node = root;
    for (const rawSegment of ref.slice(2).split('/'))
    {
        const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
        node = node?.[segment];
        if (node === undefined)
        {
            throw new Error(`Unresolvable $ref "${ref}".`);
        }
    }

    return node;
}

function deepEqual(a, b)
{
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(value)
{
    if (Array.isArray(value))
    {
        return value.map(canonical);
    }
    if (value !== null && typeof value === 'object')
    {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }

    return value;
}

function validateNode(schema, value, pointer, root, errors)
{
    if (schema === true)
    {
        return;
    }
    if (schema === false)
    {
        errors.push({ pointer, message: 'schema forbids any value here' });

        return;
    }

    for (const keyword of Object.keys(schema))
    {
        if (!SUPPORTED.has(keyword) && !ANNOTATIONS.has(keyword) && keyword !== '$defs')
        {
            throw new Error(`Unsupported JSON Schema keyword "${keyword}" at ${pointer || '/'}.`);
        }
    }

    if (schema.$ref !== undefined)
    {
        validateNode(resolveRef(root, schema.$ref), value, pointer, root, errors);
    }

    if (schema.const !== undefined && !deepEqual(schema.const, value))
    {
        errors.push({ pointer, message: `expected const ${JSON.stringify(schema.const)}` });
    }

    if (schema.enum !== undefined && !schema.enum.some(candidate => deepEqual(candidate, value)))
    {
        errors.push({ pointer, message: `value is not one of ${JSON.stringify(schema.enum)}` });
    }

    if (schema.type !== undefined)
    {
        const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!expected.some(one => matchesType(value, one)))
        {
            errors.push({ pointer, message: `expected type ${expected.join('|')}, got ${typeOf(value)}` });

            return;
        }
    }

    for (const branch of schema.allOf ?? [])
    {
        validateNode(branch, value, pointer, root, errors);
    }

    if (schema.anyOf !== undefined && !schema.anyOf.some(branch => matches(branch, value, root)))
    {
        errors.push({ pointer, message: 'value matches no anyOf branch' });
    }

    if (schema.oneOf !== undefined)
    {
        const hits = schema.oneOf.filter(branch => matches(branch, value, root)).length;
        if (hits !== 1)
        {
            errors.push({ pointer, message: `value matches ${hits} oneOf branches, expected exactly 1` });
        }
    }

    const kind = typeOf(value);
    if (kind === 'string')
    {
        validateString(schema, value, pointer, errors);
    }
    if (kind === 'number' || kind === 'integer')
    {
        validateNumber(schema, value, pointer, errors);
    }
    if (kind === 'array')
    {
        validateArray(schema, value, pointer, root, errors);
    }
    if (kind === 'object')
    {
        validateObject(schema, value, pointer, root, errors);
    }
}

function validateString(schema, value, pointer, errors)
{
    if (schema.minLength !== undefined && value.length < schema.minLength)
    {
        errors.push({ pointer, message: `shorter than minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
    {
        errors.push({ pointer, message: `longer than maxLength ${schema.maxLength}` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value))
    {
        errors.push({ pointer, message: `does not match pattern ${schema.pattern}` });
    }
}

function validateNumber(schema, value, pointer, errors)
{
    if (schema.minimum !== undefined && value < schema.minimum)
    {
        errors.push({ pointer, message: `below minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum)
    {
        errors.push({ pointer, message: `above maximum ${schema.maximum}` });
    }
}

function validateArray(schema, value, pointer, root, errors)
{
    if (schema.minItems !== undefined && value.length < schema.minItems)
    {
        errors.push({ pointer, message: `fewer than minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
    {
        errors.push({ pointer, message: `more than maxItems ${schema.maxItems}` });
    }
    if (schema.uniqueItems === true)
    {
        const seen = new Set(value.map(item => JSON.stringify(canonical(item))));
        if (seen.size !== value.length)
        {
            errors.push({ pointer, message: 'array items are not unique' });
        }
    }
    if (schema.items !== undefined)
    {
        value.forEach((item, index) => validateNode(schema.items, item, `${pointer}/${index}`, root, errors));
    }
}

function validateObject(schema, value, pointer, root, errors)
{
    for (const key of schema.required ?? [])
    {
        if (!Object.prototype.hasOwnProperty.call(value, key))
        {
            errors.push({ pointer: `${pointer}/${key}`, message: 'required property is missing' });
        }
    }

    const patterns = Object.entries(schema.patternProperties ?? {});

    for (const [key, child] of Object.entries(value))
    {
        const childPointer = `${pointer}/${key}`;

        if (schema.propertyNames !== undefined)
        {
            validateNode(schema.propertyNames, key, childPointer, root, errors);
        }

        let covered = false;

        if (schema.properties?.[key] !== undefined)
        {
            covered = true;
            validateNode(schema.properties[key], child, childPointer, root, errors);
        }

        for (const [pattern, patternSchema] of patterns)
        {
            if (new RegExp(pattern, 'u').test(key))
            {
                covered = true;
                validateNode(patternSchema, child, childPointer, root, errors);
            }
        }

        if (covered)
        {
            continue;
        }

        if (schema.additionalProperties === false)
        {
            errors.push({ pointer: childPointer, message: 'property is not allowed' });
        }
        else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true)
        {
            validateNode(schema.additionalProperties, child, childPointer, root, errors);
        }
    }
}

function matches(schema, value, root)
{
    const errors = [];
    validateNode(schema, value, '', root, errors);

    return errors.length === 0;
}

/**
 * Validate a value against a schema document.
 *
 * @param {object} schema Parsed schema document; `$defs` must live at its root.
 * @param {unknown} value Parsed instance.
 * @returns {{ valid: boolean, errors: Array<{ pointer: string, message: string }> }}
 */
export function validate(schema, value)
{
    const errors = [];
    validateNode(schema, value, '', schema, errors);

    return { valid: errors.length === 0, errors };
}
