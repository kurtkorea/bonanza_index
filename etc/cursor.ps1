# ==========================================
# Cursor Proxy / Network Diagnostic Tool
# 작성자: ChatGPT
# 기능: Cursor AI(QA) 연결 실패 원인 자동 진단
# ==========================================

$proxy = $Env:HTTP_PROXY
$noProxy = $Env:NO_PROXY
$openaiUrl = "https://api.openai.com/v1/models"
$cursorApi = "https://api.cursor.sh"
$cursorGateway = "https://gateway.cursor.sh"

function Write-Result {
    param([string]$message, [bool]$ok)
    if ($ok) {
        Write-Host ("✅ " + $message) -ForegroundColor Green
    } else {
        Write-Host ("❌ " + $message) -ForegroundColor Red
    }
}

Write-Host "=========================================="
Write-Host "     Cursor QA Proxy & Network Diagnose"
Write-Host "==========================================`n"

# ---------------------------
# 1️⃣ Proxy Environment
# ---------------------------
Write-Host "🔍 Checking proxy environment variables..."
if ($proxy) {
    Write-Result "HTTP_PROXY = $proxy" $true
} else {
    Write-Result "HTTP_PROXY not set." $false
}
if ($noProxy) {
    Write-Result "NO_PROXY = $noProxy" $true
} else {
    Write-Result "NO_PROXY not set." $false
}
Write-Host ""

# ---------------------------
# 2️⃣ DNS Resolution
# ---------------------------
Write-Host "🔍 Checking DNS resolution..."
$dnsOk = $true

$domains = @("api.openai.com", "api.cursor.sh", "gateway.cursor.sh")
foreach ($d in $domains) {
    try {
        $result = Resolve-DnsName $d -ErrorAction Stop
        $ip = ($result | Select-Object -First 1).IPAddress
        Write-Result "$d resolved to $ip" $true
    } catch {
        Write-Result "$d - DNS lookup failed." $false
        $dnsOk = $false
    }
}
Write-Host ""

# ---------------------------
# 3️⃣ Network Connectivity
# ---------------------------
Write-Host "🔍 Testing network connectivity (curl)..."
$urls = @($openaiUrl, $cursorApi, $cursorGateway)
foreach ($url in $urls) {
    try {
        $response = curl.exe -s -o NUL -w "%{http_code}" $url
        if ($response -eq "000") {
            Write-Result "$url - Connection failed (timeout or blocked)" $false
        } elseif ($response -eq "200" -or $response -eq "404" -or $response -eq "401") {
            Write-Result "$url - Reachable (HTTP $response)" $true
        } else {
            Write-Result "$url - Responded (HTTP $response)" $true
        }
    } catch {
        Write-Result "$url - Request error." $false
    }
}
Write-Host ""

# ---------------------------
# 4️⃣ TLS / SSL Validation
# ---------------------------
Write-Host "🔍 Checking TLS / SSL validation..."
try {
    $req = [System.Net.WebRequest]::Create("https://api.openai.com")
    $req.Timeout = 5000
    $resp = $req.GetResponse()
    Write-Result "TLS handshake with api.openai.com succeeded." $true
    $resp.Close()
} catch {
    Write-Result "TLS handshake failed (certificate intercept or proxy issue)." $false
}
Write-Host ""

# ---------------------------
# 5️⃣ Summary
# ---------------------------
Write-Host "=========================================="
Write-Host "             Diagnostic Summary"
Write-Host "=========================================="

if (-not $dnsOk) {
    Write-Host "🚫 One or more domains failed DNS resolution. Likely corporate DNS block." -ForegroundColor Yellow
}

Write-Host "If api.openai.com works but api.cursor.sh fails → Cursor gateway blocked by firewall."
Write-Host "Please whitelist: api.cursor.sh, gateway.cursor.sh"
Write-Host ""
Write-Host "If TLS handshake failed → SSL inspection (middlebox) detected. Ask IT to exclude OpenAI/Cursor domains."
Write-Host ""
Write-Host "✅ After fixing, restart Cursor completely (Ctrl+Q) and retry QA."
Write-Host "=========================================="
