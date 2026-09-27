$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TestKeyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@
try {
    [TestKeyboard]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
    [TestKeyboard]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero)
    [TestKeyboard]::keybd_event(0x51, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 50
} finally {
    [TestKeyboard]::keybd_event(0x51, 0, 2, [UIntPtr]::Zero)
    [TestKeyboard]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)
    [TestKeyboard]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
}
