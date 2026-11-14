import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 200_000;
const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
};

export interface StoredSourceFile {
  originalFileName: string;
  mediaType: string;
  sha256: string;
  storageKey: string;
}

export interface CandidateSourceFileStore {
  importFromInbox(relativePath: string, sourceId: string): Promise<StoredSourceFile>;
  saveNote(sourceId: string, title: string, content: string): Promise<StoredSourceFile>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
  writeKnowledgeMap(graph: unknown): Promise<string>;
}

function assertInside(root: string, target: string): void {
  const pathFromRoot = relative(root, target);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("The requested file is outside the configured candidate directory.");
  }
}

function safeFileName(fileName: string): string {
  const baseName = basename(fileName);
  const sanitized = baseName.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 200);
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("The candidate source needs a valid file name.");
  }
  return sanitized;
}

function safeStorageTarget(dataRoot: string, storageKey: string): string {
  if (isAbsolute(storageKey)) throw new Error("Invalid source storage key.");
  const target = resolve(dataRoot, storageKey);
  assertInside(dataRoot, target);
  return target;
}

export function createCandidateSourceFileStore(options: {
  importDirectory: string;
  dataDirectory: string;
}): CandidateSourceFileStore {
  const importDirectory = resolve(options.importDirectory);
  const dataDirectory = resolve(options.dataDirectory);
  const sourceDirectory = resolve(dataDirectory, "candidate-sources");
  const knowledgeMapPath = resolve(dataDirectory, "derived", "candidate-knowledge-map.json");

  async function storeBytes(
    sourceId: string,
    originalFileName: string,
    mediaType: string,
    bytes: Buffer,
  ): Promise<StoredSourceFile> {
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      throw new Error(`Candidate source files must be ${MAX_SOURCE_BYTES / 1024 / 1024} MB or smaller.`);
    }

    const fileName = safeFileName(originalFileName);
    const storageKey = `candidate-sources/${sourceId}/${fileName}`;
    const destination = safeStorageTarget(dataDirectory, storageKey);
    const directory = resolve(sourceDirectory, sourceId);
    await mkdir(directory, { recursive: true });

    const temporaryFile = `${destination}.tmp`;
    await writeFile(temporaryFile, bytes, { flag: "wx" });
    await rename(temporaryFile, destination);

    return {
      originalFileName: fileName,
      mediaType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey,
    };
  }

  return {
    async importFromInbox(relativePath, sourceId) {
      if (isAbsolute(relativePath)) {
        throw new Error("Use a path relative to the candidate inbox folder.");
      }

      const importRoot = await realpath(importDirectory);
      const unresolvedPath = resolve(importRoot, relativePath);
      assertInside(importRoot, unresolvedPath);
      const sourcePath = await realpath(unresolvedPath);
      assertInside(importRoot, sourcePath);

      const extension = extname(sourcePath).toLowerCase();
      const mediaType = ALLOWED_MEDIA_TYPES[extension];
      if (!mediaType) {
        throw new Error("Supported candidate source types are PDF, DOCX, RTF, TXT, and Markdown.");
      }

      const fileInfo = await stat(sourcePath);
      if (!fileInfo.isFile()) throw new Error("Candidate source path must point to a file.");
      if (fileInfo.size > MAX_SOURCE_BYTES) {
        throw new Error(`Candidate source files must be ${MAX_SOURCE_BYTES / 1024 / 1024} MB or smaller.`);
      }

      return storeBytes(sourceId, basename(sourcePath), mediaType, await readFile(sourcePath));
    },

    async saveNote(sourceId, title, content) {
      const normalizedContent = content.trim();
      if (!normalizedContent) throw new Error("Candidate notes cannot be empty.");
      if (normalizedContent.length > MAX_EXTRACTED_TEXT_LENGTH) {
        throw new Error(`Candidate notes must be ${MAX_EXTRACTED_TEXT_LENGTH} characters or shorter.`);
      }

      const fileName = `${safeFileName(title || "experience-update").replace(/\.[^.]+$/, "")}.txt`;
      return storeBytes(sourceId, fileName, "text/plain", Buffer.from(normalizedContent, "utf8"));
    },

    async read(storageKey) {
      const filePath = safeStorageTarget(dataDirectory, storageKey);
      const resolvedDataDirectory = await realpath(dataDirectory);
      const resolvedFilePath = await realpath(filePath);
      assertInside(resolvedDataDirectory, resolvedFilePath);
      return readFile(resolvedFilePath);
    },

    async remove(storageKey) {
      const filePath = safeStorageTarget(dataDirectory, storageKey);
      await rm(filePath, { force: true });
    },

    async writeKnowledgeMap(graph) {
      await mkdir(resolve(dataDirectory, "derived"), { recursive: true });
      const temporaryFile = `${knowledgeMapPath}.tmp`;
      await writeFile(temporaryFile, `${JSON.stringify(graph, null, 2)}\n`, { flag: "w" });
      await rename(temporaryFile, knowledgeMapPath);
      return relative(process.cwd(), knowledgeMapPath).split(sep).join("/");
    },
  };
}

export function sourceTextLimit(): number {
  return MAX_EXTRACTED_TEXT_LENGTH;
}
