// The browser shims for Node's built-ins (src/shims), which the vendored engine runs on in the page's
// worker: each call the engine makes answers as Node's would. Differences that are on purpose (no
// working directory in the browser: it's "/") are checked as such.

import nodePath from "node:path";
import { fileURLToPath as nodeFileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as path from "../../src/shims/path";
import * as url from "../../src/shims/url";
import * as os from "../../src/shims/os";
import * as crypto from "../../src/shims/crypto";
import * as fs from "../../src/shims/fs";
import { vfs } from "../../src/shims/virtual-fs";

const posix = nodePath.posix;

describe("path shim", () => {
  const joins = [["a", "b"], ["/a", "b", "../c"], ["a/", "/b/"], ["", "a"], ["./a", "./b/."], ["/ts-src", "config/gen1_offsets.ini"], ["a", "..", ".."]];
  it.each(joins)("join(%j…) as Node's", (...parts) => expect(path.join(...parts)).toBe(posix.join(...parts)));

  const absolute = [["/a", "b"], ["/a/b", "../c"], ["/x", "/y", "z"], ["/ts-src/romhandlers", "..", "config"]];
  it.each(absolute)("resolve(%j…) as Node's", (...parts) => expect(path.resolve(...parts)).toBe(posix.resolve(...parts)));

  it("resolves a relative path from / (the browser has no working directory)", () => {
    expect(path.resolve("config", "x.ini")).toBe(posix.resolve("/", "config", "x.ini"));
  });

  const paths = ["/a/b/c.ini", "a/b", "c.tbl", "/a", "/", "a/b.tar.gz", "/a/.hidden"];
  it.each(paths)("dirname, basename, extname of %j as Node's", (p) => {
    expect(path.dirname(p)).toBe(posix.dirname(p));
    expect(path.basename(p)).toBe(posix.basename(p));
    expect(path.basename(p, ".ini")).toBe(posix.basename(p, ".ini"));
    expect(path.isAbsolute(p)).toBe(posix.isAbsolute(p));
  });

  it.each(["a/b.tar.gz", "/a/c.ini", "c.tbl", "/a.b/c"])("extname of %j as Node's", (p) => expect(path.extname(p)).toBe(posix.extname(p)));
  it.each(["/a/./b/../c/", "a//b", "../a", "."])("normalize(%j) as Node's", (p) => expect(path.normalize(p)).toBe(posix.normalize(p)));
  it("relative() and sep as Node's", () => {
    expect(path.relative("/a/b/c", "/a/d")).toBe(posix.relative("/a/b/c", "/a/d"));
    expect(path.sep).toBe(posix.sep);
  });
});

describe("url, os and crypto shims", () => {
  it("turns a file URL into its path as Node does", () => {
    for (const u of ["file:///ts-src/config/gen1_offsets.ini", new URL("file:///a/b.ts")]) expect(url.fileURLToPath(u)).toBe(nodeFileURLToPath(u));
    expect(url.fileURLToPath(url.pathToFileURL("/a/b"))).toBe("/a/b");
  });

  it("gives os.EOL as on Linux", () => expect(os.EOL).toBe("\n"));

  it("gives random bytes as a Buffer of the size asked", () => {
    const a = crypto.randomBytes(16);
    expect(Buffer.isBuffer(a)).toBe(true);
    expect(a).toHaveLength(16);
    expect(a.equals(crypto.randomBytes(16))).toBe(false);
  });
});

describe("fs shim (the calls the ROM reader makes)", () => {
  const bytes = Uint8Array.from({ length: 64 }, (_, i) => i);
  vfs.register("/roms/test/input.gb", bytes);
  vfs.register("/ts-src/config/test_offsets.ini", new TextEncoder().encode("[Red]\nGame=POKEMON RED\n"));

  it("finds a file by its path, a longer one ending in it, or its name", () => {
    expect(fs.existsSync("/roms/test/input.gb")).toBe(true);
    expect(fs.existsSync("/some/where/config/test_offsets.ini")).toBe(true);
    expect(fs.existsSync("/roms/test/missing.gb")).toBe(false);
    expect(() => fs.accessSync("/roms/test/missing.gb")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(fs.statSync("/roms/test/input.gb")).toMatchObject({ size: 64 });
    expect(fs.statSync("/roms/test/input.gb").isFile()).toBe(true);
  });

  it("reads a file as bytes or text", () => {
    const b = fs.readFileSync("/roms/test/input.gb");
    expect(Buffer.isBuffer(b)).toBe(true);
    expect([...(b as Buffer)]).toEqual([...bytes]);
    expect(fs.readFileSync("config/test_offsets.ini", "utf8")).toBe("[Red]\nGame=POKEMON RED\n");
    expect(fs.readFileSync("config/test_offsets.ini", { encoding: "utf-8" })).toBe("[Red]\nGame=POKEMON RED\n");
    expect(() => fs.readFileSync("/nope.gb")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("reads at a position into a buffer at an offset, short at the end, as Node's readSync", () => {
    const fd = fs.openSync("/roms/test/input.gb", "r");
    const buf = Buffer.alloc(8);
    expect(fs.readSync(fd, buf, 2, 4, 10)).toBe(4);
    expect([...buf]).toEqual([0, 0, 10, 11, 12, 13, 0, 0]);
    expect(fs.readSync(fd, buf, 0, 8, 60)).toBe(4); // only 4 bytes left
    expect(fs.readSync(fd, buf, 0, 8, 64)).toBe(0);
    fs.closeSync(fd);
    expect(() => fs.readSync(fd, buf, 0, 1, 0)).toThrow(expect.objectContaining({ code: "EBADF" }));
    expect(() => fs.openSync("/nope.gb", "r")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("writes a file that reads back", () => {
    fs.writeFileSync("/out/test.txt", "hello");
    expect(fs.readFileSync("/out/test.txt", "utf8")).toBe("hello");
  });
});
