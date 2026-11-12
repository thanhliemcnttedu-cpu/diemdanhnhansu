; Extra NSIS rules for the lite desktop installer (electron-builder "nsis.include").
;
; By default the installer STOPS with "Failed to uninstall old application files" when the uninstaller of the
; previously installed version cannot run or returns an error (damaged uninstaller, antivirus lock, ...).
; The new files overwrite the old ones anyway, so a failed clean-up of the old version must not block the upgrade:
; log it and continue. User data lives in %APPDATA% and is never touched by the installer.

!macro lhhpIgnoreOldUninstallFailure
  ${if} ${Errors}
    DetailPrint "Old version: uninstaller could not be started. Installing over the old files."
  ${elseif} $R0 != 0
    DetailPrint "Old version: uninstaller returned code $R0. Installing over the old files."
  ${endif}
  ClearErrors
!macroend

; old version installed for all users (Program Files)
!macro customUnInstallCheck
  !insertmacro lhhpIgnoreOldUninstallFailure
!macroend

; old version installed for the current user only
!macro customUnInstallCheckCurrentUser
  !insertmacro lhhpIgnoreOldUninstallFailure
!macroend
