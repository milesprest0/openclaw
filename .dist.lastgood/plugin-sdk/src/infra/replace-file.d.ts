import "./fs-safe-defaults.js";
import { type MovePathWithCopyFallbackOptions as BaseMovePathWithCopyFallbackOptions } from "@openclaw/fs-safe/atomic";
export {
  replaceDirectoryAtomic,
  replaceFileAtomic,
  replaceFileAtomicSync,
  type ReplaceDirectoryAtomicOptions,
  type ReplaceFileAtomicFileSystem,
  type ReplaceFileAtomicOptions,
  type ReplaceFileAtomicResult,
  type ReplaceFileAtomicSyncFileSystem,
  type ReplaceFileAtomicSyncOptions,
} from "@openclaw/fs-safe/atomic";
export type MovePathWithCopyFallbackOptions = BaseMovePathWithCopyFallbackOptions & {
  sourceHardlinks?: "allow" | "reject";
};
export declare function movePathWithCopyFallback(
  options: MovePathWithCopyFallbackOptions,
): Promise<void>;
