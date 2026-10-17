const refusalCode = "C11_COPY_CORRUPTION_REFUSED";
const migrationCopyHeader = "COPY public.music_schema_migrations (id, checksum, schema_checksum, applied_at) FROM stdin;";
const playlistCopyHeader = "COPY public.playlists (id, user_id, name, description, is_visible_to_guests, created_at, updated_at) FROM stdin;";
const seededPlaylistName = "Restore qualification";

export interface C11CopyCorruptionResult {
  dataDump: Buffer;
  earlierRows: number;
  targetRows: number;
  corruptedRow: 1;
}

function refuse(): never {
  throw new Error(refusalCode);
}

function exactMaximumBytes(options: { maximumBytes: number } | undefined): number {
  if (!options || typeof options !== "object"
      || Object.keys(options).some((key) => key !== "maximumBytes")
      || !Number.isSafeInteger(options.maximumBytes)
      || options.maximumBytes < 1) refuse();
  return options.maximumBytes;
}

function onlyLine(lines: string[], expected: string): number {
  const matches: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === expected) matches.push(index);
  }
  if (matches.length !== 1) refuse();
  return matches[0];
}

function copyRows(lines: string[], headerIndex: number): { rows: string[]; terminatorIndex: number } {
  const terminatorIndex = lines.indexOf("\\.", headerIndex + 1);
  if (terminatorIndex < 0) refuse();
  const rows = lines.slice(headerIndex + 1, terminatorIndex);
  if (rows.length === 0 || rows.some((row) => row.length === 0 || row.startsWith("COPY "))) refuse();
  return { rows, terminatorIndex };
}

function validMigrationRow(row: string): boolean {
  const fields = row.split("\t");
  return fields.length === 4
    && /^\d{4}_[a-z0-9_]+$/.test(fields[0])
    && /^[a-f0-9]{64}$/.test(fields[1])
    && /^[a-f0-9]{64}$/.test(fields[2])
    && fields[3].length > 0;
}

function playlistId(rows: string[]): string {
  if (rows.length !== 1) refuse();
  const fields = rows[0].split("\t");
  if (fields.length !== 7
      || !/^[1-9]\d*$/.test(fields[0])
      || !/^[1-9]\d*$/.test(fields[1])
      || fields[2] !== seededPlaylistName
      || fields[3] !== "\\N"
      || fields[4] !== "t"
      || fields[5].length === 0
      || fields[6].length === 0) refuse();
  return fields[0];
}

export function corruptC11LaterCopyRow(
  dataDump: Buffer,
  options: { maximumBytes: number },
): C11CopyCorruptionResult {
  const maximumBytes = exactMaximumBytes(options);
  if (!Buffer.isBuffer(dataDump) || dataDump.length === 0 || dataDump.length > maximumBytes
      || dataDump.includes(0x00) || dataDump.includes(0x0d)) refuse();

  const text = dataDump.toString("utf8");
  if (!text.endsWith("\n") || !Buffer.from(text, "utf8").equals(dataDump)) refuse();
  const lines = text.split("\n");
  const migrationHeaderIndex = onlyLine(lines, migrationCopyHeader);
  const playlistHeaderIndex = onlyLine(lines, playlistCopyHeader);
  const migration = copyRows(lines, migrationHeaderIndex);
  const playlist = copyRows(lines, playlistHeaderIndex);
  if (migration.terminatorIndex >= playlistHeaderIndex || !migration.rows.every(validMigrationRow)) refuse();

  const id = playlistId(playlist.rows);
  const targetRowIndex = playlistHeaderIndex + 1;
  const targetRowOffset = Buffer.byteLength(lines.slice(0, targetRowIndex).join("\n"), "utf8") + 1;
  const output = Buffer.from(dataDump);
  output[targetRowOffset] = 0x78;
  output.fill(0x30, targetRowOffset + 1, targetRowOffset + Buffer.byteLength(id, "ascii"));
  if (output.length !== dataDump.length) refuse();

  return {
    dataDump: output,
    earlierRows: migration.rows.length,
    targetRows: playlist.rows.length,
    corruptedRow: 1,
  };
}
