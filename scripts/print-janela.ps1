<#
.SYNOPSIS
  Captura a janela do Claude Dynasty (ou outra, pelo título) num PNG.

.DESCRIPTION
  Serve para conferir uma mudança de interface sem depender de alguém descrever o que apareceu —
  em especial para o Claude Code, que pode rodar isto e depois ler o PNG.

  Usa PrintWindow com PW_RENDERFULLCONTENT (flag 2), e não uma captura de tela:

  - pega a janela mesmo **atrás** de outras, então não precisa trazê-la para frente;
  - não rouba o foco de quem está usando o computador;
  - sem a flag 2 a imagem sai preta, porque a janela do Electron é composta pela GPU.

  Limite conhecido: com a janela **minimizada** o Windows devolve um retângulo de 160x28 e não há
  o que capturar. O script avisa e sai com código 1 em vez de salvar um PNG inútil.

.PARAMETER Titulo
  Parte do título da janela. Padrão: "Claude Dynasty".

.PARAMETER Saida
  Caminho do PNG. Padrão: %TEMP%\claude-dynasty-print.png

.EXAMPLE
  pwsh -File scripts/print-janela.ps1
  pwsh -File scripts/print-janela.ps1 -Titulo 'Claude Dynasty' -Saida .\tela.png
#>
param(
  [string]$Titulo = 'Claude Dynasty',
  [string]$Saida = (Join-Path $env:TEMP 'claude-dynasty-print.png')
)

Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Runtime.InteropServices;
public class JanelaNativa {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@
if (-not ('JanelaNativa' -as [type])) { Add-Type -TypeDefinition $sig }

$proc = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Titulo*" } |
  Select-Object -First 1

if (-not $proc) {
  Write-Output "Janela nao encontrada: *$Titulo*  (o app esta aberto?)"
  exit 1
}

$r = New-Object JanelaNativa+RECT
[void][JanelaNativa]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
$w = $r.R - $r.L
$h = $r.B - $r.T

# janela minimizada devolve um retangulo minusculo: nao adianta capturar
if ($w -le 200 -or $h -le 100) {
  Write-Output "Janela minimizada ou sem tamanho ($w x $h) - restaure-a e rode de novo."
  exit 1
}

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
$ok = [JanelaNativa]::PrintWindow($proc.MainWindowHandle, $dc, 2)
$g.ReleaseHdc($dc)
$g.Dispose()

if (-not $ok) {
  $bmp.Dispose()
  Write-Output 'PrintWindow falhou.'
  exit 1
}

$dir = Split-Path -Parent $Saida
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$bmp.Save($Saida, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "$Saida ($w x $h) - $($proc.MainWindowTitle)"
