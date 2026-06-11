; Custom NSIS install/uninstall hooks for WTMS

!macro customInstall
  DetailPrint "Configuring Windows Firewall for WTMS..."
  ; Remove any existing WTMS firewall rules first (ignore errors if not present)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WTMS Port 8080"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WTMS Application"'
  ; Allow inbound TCP on port 8080 (required for server mode, harmless on client PCs)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="WTMS Port 8080" dir=in action=allow protocol=TCP localport=8080 profile=domain,private,public'
  ; Allow inbound connections to the WTMS executable itself
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="WTMS Application" dir=in action=allow program="$INSTDIR\WTMS.exe" profile=domain,private,public'
  DetailPrint "Firewall rules configured."
!macroend

!macro customUninstall
  DetailPrint "Removing WTMS Firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WTMS Port 8080"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WTMS Application"'
!macroend
