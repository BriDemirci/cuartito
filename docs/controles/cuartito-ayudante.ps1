<#
  cuartito · ayudante opcional del wallpaper

  Los wallpapers web de Wallpaper Engine y Lively solo pueden LEER qué canción suena.
  Este script escucha en http://localhost:8978 y hace dos cosas:
    - cuando tocás un botón del wallpaper, aprieta las teclas multimedia de Windows
      (anterior, play/pausa, siguiente). Anda con Spotify, YouTube y cualquier app que las use.
    - le cuenta al wallpaper cuánto se está usando la CPU y la RAM, así el gato se eriza
      cuando la PC está exigida.

  Uso:
    iniciar.bat       lo arranca ahora, oculto
    instalar.bat      lo arranca ahora y cada vez que prendés la PC
    desinstalar.bat   lo cierra y lo saca del inicio
#>
param([switch]$Instalar, [switch]$Desinstalar, [int]$Puerto = 8978)

$ErrorActionPreference = 'Stop'
$argumentos = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""

function Cerrar-Otros {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*cuartito-ayudante.ps1*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Instalar -or $Desinstalar) {
  $acceso = Join-Path ([Environment]::GetFolderPath('Startup')) 'cuartito ayudante.lnk'
}

if ($Instalar) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($acceso)
  $lnk.TargetPath = (Get-Command powershell.exe).Source
  $lnk.Arguments = $argumentos
  $lnk.WindowStyle = 7
  $lnk.Description = 'cuartito: botones de música y estado de la PC para el wallpaper'
  $lnk.Save()
  Cerrar-Otros
  Start-Process -FilePath $lnk.TargetPath -ArgumentList $argumentos -WindowStyle Hidden
  Write-Host 'Listo: el ayudante ya está andando y va a arrancar solo con Windows.'
  return
}

if ($Desinstalar) {
  Remove-Item $acceso -ErrorAction SilentlyContinue
  Cerrar-Otros
  Write-Host 'Listo: el ayudante se cerró y ya no arranca con Windows.'
  return
}

Add-Type -Namespace Cuartito -Name Teclas -MemberDefinition @'
[DllImport("user32.dll")]
public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);
'@

# Códigos de las teclas multimedia de Windows
$TECLAS = @{ playpause = 0xB3; next = 0xB0; prev = 0xB1 }

function Apretar([byte]$tecla) {
  [Cuartito.Teclas]::keybd_event($tecla, 0, 0, [UIntPtr]::Zero)
  [Cuartito.Teclas]::keybd_event($tecla, 0, 2, [UIntPtr]::Zero)   # 2 = soltar la tecla
}

# Solo se aceptan pedidos del wallpaper (archivo local) o de esta misma PC.
# Las páginas web siempre tienen un origen http(s):// de otro sitio, así que no pueden usarlo.
function Origen-Permitido([string]$origen) {
  if (-not $origen -or $origen -eq 'null') { return $true }
  if ($origen -match '^https?://(localhost|127\.0\.0\.1)(:\d+)?$') { return $true }
  return $origen -notmatch '^https?://'
}

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Puerto/")
try { $http.Start() }
catch { Write-Host "El puerto $Puerto está ocupado. ¿Ya estaba corriendo?"; return }
Write-Host "Ayudante de cuartito andando en http://localhost:$Puerto (cerrá esta ventana para apagarlo)"

# Uso de CPU y RAM en porcentaje. Se usa CIM porque los nombres de los contadores de rendimiento
# cambian con el idioma de Windows. Se mide como mucho cada 3 segundos.
$script:estado = @{ cpu = 0; ram = 0; cuando = [datetime]::MinValue }
function Estado-PC {
  if (([datetime]::Now - $script:estado.cuando).TotalSeconds -ge 3) {
    try {
      $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
      $so = Get-CimInstance Win32_OperatingSystem
      $script:estado.cpu = [int]$cpu
      $script:estado.ram = [int](100 - 100 * $so.FreePhysicalMemory / $so.TotalVisibleMemorySize)
    } catch { }
    $script:estado.cuando = [datetime]::Now
  }
  return $script:estado
}

while ($http.IsListening) {
  # Cualquier error en un pedido se ignora: el servidor tiene que seguir andando
  try {
    $ctx = $http.GetContext()
    $pedido = $ctx.Request
    $respuesta = $ctx.Response
    $origen = $pedido.Headers['Origin']
    $accion = $pedido.Url.AbsolutePath.Trim('/').ToLower()
    $codigo = 200
    $cuerpo = '{"ok":true}'

    if (-not (Origen-Permitido $origen)) {
      $codigo = 403; $cuerpo = '{"ok":false}'
    } else {
      if ($origen) {
        $respuesta.AddHeader('Access-Control-Allow-Origin', $origen)
        $respuesta.AddHeader('Access-Control-Allow-Headers', 'X-Cuartito')
        $respuesta.AddHeader('Access-Control-Allow-Methods', 'GET, POST')
        # Chrome pide permiso extra para que un archivo local hable con localhost
        $respuesta.AddHeader('Access-Control-Allow-Private-Network', 'true')
      }
      if ($pedido.HttpMethod -eq 'OPTIONS') { $codigo = 204; $cuerpo = '' }
      elseif ($accion -eq 'ping') { $cuerpo = '{"ok":true,"app":"cuartito","version":1}' }
      elseif ($accion -eq 'estado') {
        $e = Estado-PC
        $cuerpo = '{"ok":true,"app":"cuartito","cpu":' + $e.cpu + ',"ram":' + $e.ram + '}'
      }
      elseif ($pedido.HttpMethod -eq 'POST' -and $pedido.Headers['X-Cuartito'] -eq '1' -and $TECLAS.ContainsKey($accion)) {
        # Un error al apretar la tecla no tiene que tirar abajo el servidor
        try { Apretar $TECLAS[$accion] } catch { $codigo = 500; $cuerpo = '{"ok":false}' }
      }
      else { $codigo = 404; $cuerpo = '{"ok":false}' }
    }

    $bytes = [Text.Encoding]::UTF8.GetBytes($cuerpo)
    $respuesta.StatusCode = $codigo
    $respuesta.ContentType = 'application/json'
    if ($bytes.Length) { $respuesta.OutputStream.Write($bytes, 0, $bytes.Length) }
    $respuesta.Close()
  } catch { }
}
