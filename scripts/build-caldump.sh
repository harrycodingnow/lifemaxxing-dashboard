#!/usr/bin/env bash
# Build + ad-hoc sign the EventKit calendar helper (scripts/caldump.app).
# Requires Xcode command-line tools (swiftc). Read-only calendar access.
set -euo pipefail
cd "$(dirname "$0")"

echo "Compiling caldump.swift (EventKit)…"
swiftc -O caldump.swift -o caldump \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker caldump-Info.plist

echo "Assembling caldump.app bundle…"
APP="caldump.app"
mkdir -p "$APP/Contents/MacOS"
cp caldump "$APP/Contents/MacOS/caldump"
cp caldump-Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string caldump" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "$APP/Contents/Info.plist" 2>/dev/null || true

echo "Ad-hoc code-signing (stable TCC identity)…"
codesign --force --deep --sign - --identifier com.harry.lifemaxxing.caldump "$APP"
codesign -dv "$APP" 2>&1 | head -3

echo "✓ Built $APP"
echo "Next: npm run calendar:grant   (approve the macOS Calendar prompt once)"
