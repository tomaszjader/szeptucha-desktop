param([Parameter(Mandatory=$true)][string]$Rectangles)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptureDpi {
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$previousDpi = [CaptureDpi]::SetThreadDpiAwarenessContext([IntPtr](-4))
try {
    $items = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rectangles)) | ConvertFrom-Json
    $result = @(foreach ($item in $items) {
        $bitmap = New-Object System.Drawing.Bitmap ([int]$item.width), ([int]$item.height)
        $graphics = $null
        $stream = $null
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen([int]$item.x, [int]$item.y, 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
            $stream = New-Object System.IO.MemoryStream
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            @{ id = [string]$item.id; png = [Convert]::ToBase64String($stream.ToArray()) }
        } finally {
            if ($stream) { $stream.Dispose() }
            if ($graphics) { $graphics.Dispose() }
            $bitmap.Dispose()
        }
    })
    ConvertTo-Json -InputObject $result -Compress
} finally {
    [void][CaptureDpi]::SetThreadDpiAwarenessContext($previousDpi)
}
