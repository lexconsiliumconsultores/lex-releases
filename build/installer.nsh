!macro preInit
  ; Limpiar restos de instalaciones anteriores de LEX
  ; Desinstalar versiones viejas automáticamente
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LEX - Gestión Jurídica" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S _?=$INSTDIR\Uninstall LEX - Gestión Jurídica.exe'
  ${EndIf}

  ; Limpiar registry keys viejos
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LEX - Gestión Jurídica"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LEX"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Lex"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LEX - Gestión Jurídica"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LEX"

  ; Limpiar archivos viejos
  RMDir /r "$LOCALAPPDATA\Programs\lex"
  RMDir /r "$LOCALAPPDATA\lex"
  RMDir /r "$APPDATA\lex"
!macroend
