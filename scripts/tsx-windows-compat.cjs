// tsx derives its temporary directory from os.userInfo() on Windows. In some
// managed Windows environments libuv cannot resolve that account and throws
// ENOMEM, which prevents the API from starting. A stable per-machine suffix
// avoids that lookup while leaving Unix behavior unchanged.
if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  process.geteuid = () => 0;
  const preload = `--require="${__filename.replaceAll('\\', '/')}"`;
  if (!process.env.NODE_OPTIONS?.includes(__filename)) {
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ');
  }
}
