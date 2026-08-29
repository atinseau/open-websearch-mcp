import type { ObscuraArtifact } from "@/features/rendering";

/** Immutable release data for the only production renderer accepted by v1. */
export const productionObscuraArtifact: ObscuraArtifact = {
  version: "0.2.1",
  variant: "macos-arm64",
  url: "https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.1/obscura-aarch64-macos-stealth.tar.gz",
  sha256: "c20008431f96879ab5d73f3d5e0cc5c45bdb85add523ccd34ac9df75bb6703f8",
  sizeBytes: 81_181_488,
  maximumExtractedBytes: 335_544_320,
  expectedFiles: ["obscura", "obscura-worker"],
};
