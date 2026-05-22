@echo off
title Servidor Jarvis
echo ===================================================
echo INICIANDO SERVIDOR DO JARVIS ORB (GOOGLE CHROME)
echo ===================================================
echo O Google Chrome exige que ferramentas de voz rodem em um servidor local.
echo Mantendo esta janela aberta, o Jarvis funcionara perfeitamente!
echo.
start chrome "http://localhost:8080"
powershell -Command "$l=New-Object System.Net.HttpListener;$l.Prefixes.Add('http://localhost:8080/');$l.Start();while($true){$c=$l.GetContext();$p='C:\Mkt-Apps\jarvis-orb'+$c.Request.Url.LocalPath.Replace('/','\');if($p.EndsWith('\')){$p+='index.html'};if(Test-Path $p){$b=[IO.File]::ReadAllBytes($p);$c.Response.ContentLength64=$b.Length;$c.Response.OutputStream.Write($b,0,$b.Length)}else{$c.Response.StatusCode=404};$c.Response.Close()}"
