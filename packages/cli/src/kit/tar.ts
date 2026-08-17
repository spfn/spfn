/**
 * Reading a release's scaffold archive, and refusing the entries that would
 * write outside the directory it was told to fill.
 *
 * A tar is a list of paths chosen by whoever built it, and the CLI expands one
 * into a directory a customer named. That is the whole reason this is a reader
 * of its own rather than a shell-out to `tar`: an absolute path, a `..` segment
 * or a symlink pointing at `/etc` are all legal tar entries, and `tar -x`
 * happily honours some of them. Here they are refused by name before a single
 * byte is written, and nothing but a plain file or a directory is expanded at
 * all.
 *
 * The format read is POSIX ustar: 512-byte header blocks, 512-byte aligned
 * payloads, and two zero blocks at the end. Pax and GNU extension headers are
 * skipped rather than interpreted — a scaffold that needs them is a scaffold
 * this CLI should refuse rather than half-understand.
 */

const BLOCK = 512;

/** Entry kinds this reader will expand. Everything else is refused. */
const FILE_TYPES = new Set(['0', '\0']);
const DIRECTORY_TYPE = '5';
/** Pax/GNU metadata blocks that carry no file of their own. */
const SKIPPED_TYPES = new Set(['x', 'g', 'V']);

export interface TarEntry
{
    /** A project-relative path, already checked to stay inside the target. */
    path: string;
    kind: 'file' | 'directory';
    /** Only the low permission bits; ownership and setuid are dropped. */
    mode: number;
    bytes: Uint8Array;
}

export class TarFormatError extends Error
{
    readonly reason: string;
    readonly entryPath: string | null;

    constructor(reason: string, message: string, entryPath: string | null = null)
    {
        super(message);
        this.name = 'TarFormatError';
        this.reason = reason;
        this.entryPath = entryPath;
    }
}

/**
 * Every entry of a ustar archive, in the order it was written.
 *
 * The whole archive is in memory already — it arrived as one verified artifact
 * — so this reads rather than streams, and stays a pure function of the bytes.
 */
export function readTar(archive: Uint8Array): TarEntry[]
{
    const view = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
    const entries: TarEntry[] = [];
    let offset = 0;

    while (offset + BLOCK <= view.length)
    {
        const header = view.subarray(offset, offset + BLOCK);

        if (isZeroBlock(header))
        {
            break;
        }

        const size = readOctal(header, 124, 12);
        const type = String.fromCharCode(header[156]);
        const payloadStart = offset + BLOCK;

        if (payloadStart + size > view.length)
        {
            throw new TarFormatError('truncated-payload', 'The scaffold archive ends inside an entry.');
        }

        offset = payloadStart + Math.ceil(size / BLOCK) * BLOCK;

        if (SKIPPED_TYPES.has(type))
        {
            continue;
        }

        const path = safeEntryPath(readString(header, 0, 100), readString(header, 345, 155));

        if (type === DIRECTORY_TYPE)
        {
            entries.push({ path, kind: 'directory', mode: readOctal(header, 100, 8) & 0o777, bytes: new Uint8Array(0) });

            continue;
        }
        if (!FILE_TYPES.has(type))
        {
            throw new TarFormatError(
                'unsupported-entry-type',
                'The scaffold archive holds an entry that is neither a file nor a directory.',
                path,
            );
        }

        entries.push({
            path,
            kind: 'file',
            mode: readOctal(header, 100, 8) & 0o777,
            bytes: new Uint8Array(view.subarray(payloadStart, payloadStart + size)),
        });
    }

    return entries;
}

/**
 * The path an entry may be written to, or a refusal.
 *
 * `./` prefixes are normal in archives and are dropped; anything that could
 * leave the target directory is not normalised away, it is refused, because a
 * scaffold that asks to write outside its own project is not a scaffold with a
 * typo in it.
 */
function safeEntryPath(name: string, prefix: string): string
{
    const joined = prefix.length > 0 ? `${prefix}/${name}` : name;
    const path = joined.replace(/^\.\//, '').replace(/\/+$/, '');

    if (path.length === 0)
    {
        throw new TarFormatError('empty-entry-path', 'The scaffold archive holds an entry with no path.');
    }
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
    {
        throw new TarFormatError('absolute-entry-path', 'The scaffold archive holds an absolute path.', path);
    }
    if (path.includes('\\'))
    {
        throw new TarFormatError('backslash-entry-path', 'The scaffold archive holds a backslash in a path.', path);
    }
    if (path.split('/').includes('..'))
    {
        throw new TarFormatError('escaping-entry-path', 'The scaffold archive holds a path that leaves the project.', path);
    }

    return path;
}

function isZeroBlock(header: Buffer): boolean
{
    return header.every(byte => byte === 0);
}

function readString(header: Buffer, start: number, length: number): string
{
    const field = header.subarray(start, start + length);
    const end = field.indexOf(0);

    return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function readOctal(header: Buffer, start: number, length: number): number
{
    const text = readString(header, start, length).trim();

    if (text.length === 0)
    {
        return 0;
    }

    const value = Number.parseInt(text, 8);

    if (!Number.isSafeInteger(value) || value < 0)
    {
        throw new TarFormatError('malformed-header-number', 'The scaffold archive has an unreadable header field.');
    }

    return value;
}
