param(
    [string]$MockDate = '',
    [string]$MockTime = '',
    [string]$MockTimeUrl = ''
)

try {
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $rawDate = ([string]$MockDate).Trim()
    $rawTime = ([string]$MockTime).Trim()
    $payload = @{}
    $dateFormats = @('dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'yyyy-M-d')
    $timeFormats = @('HH:mm:ss', 'H:mm:ss', 'HH:mm', 'H:mm')
    $dateTimeFormats = @(
        'dd/MM/yyyy HH:mm:ss', 'd/M/yyyy H:mm:ss', 'dd/MM/yyyy H:mm:ss', 'd/M/yyyy HH:mm:ss',
        'dd/MM/yyyy HH:mm', 'd/M/yyyy H:mm', 'dd/MM/yyyy H:mm', 'd/M/yyyy HH:mm',
        'yyyy-MM-dd HH:mm:ss', 'yyyy-M-d H:mm:ss', 'yyyy-MM-dd H:mm:ss', 'yyyy-M-d HH:mm:ss',
        'yyyy-MM-dd HH:mm', 'yyyy-M-d H:mm', 'yyyy-MM-dd H:mm', 'yyyy-M-d HH:mm'
    )

    function Parse-DateTimeExact([string]$Value, [string[]]$Formats, [string]$Label) {
        $parsed = [datetime]::MinValue
        foreach ($format in $Formats) {
            if ([datetime]::TryParseExact($Value, $format, $culture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
                return $parsed
            }
        }
        throw "Invalid $Label format: $Value"
    }

    if (-not [string]::IsNullOrWhiteSpace($rawDate)) {
        if ($rawDate -match '\s' -and [string]::IsNullOrWhiteSpace($rawTime)) {
            $dateTimeValue = Parse-DateTimeExact $rawDate $dateTimeFormats 'date/time'
            $payload['datetime'] = $dateTimeValue.ToString('yyyy-MM-dd HH:mm:ss')
        } else {
            $datePart = Parse-DateTimeExact $rawDate $dateFormats 'date'
            $payload['date'] = $datePart.ToString('yyyy-MM-dd')
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($rawTime) -and -not $payload.ContainsKey('datetime')) {
        $timeValue = Parse-DateTimeExact $rawTime $timeFormats 'time'
        $payload['time'] = $timeValue.ToString('HH:mm:ss')
    }

    $body = $payload | ConvertTo-Json
    Invoke-RestMethod -Method Put -Uri $MockTimeUrl -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
}
catch {
    Write-Host ('Cannot set mock time: ' + $_.Exception.Message)
    exit 1
}
