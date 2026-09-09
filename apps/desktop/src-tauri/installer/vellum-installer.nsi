; Vellum's NSIS installer, derived from Tauri 2.10.3's installer.nsi.
; Keep the Handlebars placeholders: tauri-bundler renders this file before NSIS.
; The deliberately short visible flow is welcome -> progress -> launch.
Unicode true
ManifestDPIAware true
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  SetCompressor /SOLID "{{compression}}"
!endif

!include MUI2.nsh
!include nsDialogs.nsh
!include WinMessages.nsh
!include FileFunc.nsh
!include x64.nsh
!include StrFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
${StrCase}
${StrLoc}

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var OldMainBinaryName
Var SplashInstallButton
Var SplashBitmap
Var SplashBitmapHandle
Var SplashLogo
Var SplashTitleFont
Var SplashBodyFont
Var SplashButtonFont

Name "${PRODUCTNAME}"
; The copyright belongs in the executable metadata, not in the visual page.
; MUI's branding control creates the grey footer seen in the old screenshot.
; An empty value makes MUI2 fall back to its default "Nullsoft Install
; System" label. A single space keeps the branding control intentionally blank.
BrandingText " "
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\${PRODUCTNAME}"
VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME} installer"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!addplugindir "${ADDITIONALPLUGINSPATH}"
RequestExecutionLevel user

!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif
; Do not enable MUI's header strip. The public installer uses a page-level
; composition instead; enabling this adds the old 150x57 toolbar above it.
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

!define MUI_FINISHPAGE_TEXT "Vellum is ready."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Vellum"
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
ShowInstDetails hide
InstProgressFlags smooth colored
InstallColors "4a4035" "f7f6f1"
Page custom SplashPage SplashLeave
!define MUI_PAGE_CUSTOMFUNCTION_SHOW StyleInstFilesPage
!insertmacro MUI_PAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
!include "{{this}}"
{{/each}}

; Tauri makes configured resources available to Handlebars as absolute source
; paths. Extract them into $PLUGINSDIR before the splash page appears. This
; keeps the artwork load independent of Tauri's temporary NSIS working folder.
!macro ExtractSplashArtwork
{{#each resources_dirs}}
  CreateDirectory "$PLUGINSDIR\\{{this}}"
{{/each}}
{{#each resources}}
  File "/oname=$PLUGINSDIR\\{{this.[1]}}" "{{no-escape @key}}"
{{/each}}
!macroend

; A deliberately small, centered product page. The controls are real Win32
; controls so keyboard navigation, high-DPI scaling and localisation continue
; to work; the logo uses the existing derived NSIS header tile.
Function SplashPage
  ; 1044 is the full-page dialog resource used by the MUI host. The generic
  ; nsDialogs example uses 1018, but that resource creates an inset child page
  ; when hosted after MUI2, which is exactly the grey card seen in the preview.
  nsDialogs::Create 1044
  Pop $0
  ${IfThen} $0 == error ${|} Abort ${|}

  ; Paint the custom dialog itself. This removes the old full-bleed bitmap and
  ; prevents DPI-dependent stretching from moving the composition.
  SetCtlColors $0 "4a4035" "f7f6f1"

  ; Remove MUI chrome that is still created by the host dialog. The IDs are
  ; stable MUI controls: branding, header image, header rule and header text.
  GetDlgItem $1 $HWNDPARENT 1028
  ; Keep the reserved branding area alive, but paint it as part of the page.
  ; Hiding it exposes the outer dialog's default Windows grey background.
  SetCtlColors $1 "f7f6f1" "f7f6f1"
  ShowWindow $1 ${SW_SHOW}
  GetDlgItem $1 $HWNDPARENT 1256
  SetCtlColors $1 "f7f6f1" "f7f6f1"
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1035
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1045
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1037
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1038
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1039
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1040
  ShowWindow $1 ${SW_HIDE}
  SetCtlColors $HWNDPARENT "f7f6f1" "f7f6f1"

  ${NSD_CreateBitmap} 115u 14u 70u 26u ""
  Pop $SplashLogo
  ${NSD_SetStretchedBitmap} $SplashLogo "$PLUGINSDIR\\installer\\nsis-header.bmp" $SplashBitmapHandle

  ${NSD_CreateLabel} 96u 52u 108u 24u "Vellum"
  Pop $1
  SetCtlColors $1 "4a4035" transparent
  CreateFont $SplashTitleFont "Georgia" 19 400
  SendMessage $1 ${WM_SETFONT} $SplashTitleFont 1

  ${NSD_CreateLabel} 74u 82u 152u 16u "Your city, beautifully mapped."
  Pop $1
  SetCtlColors $1 "665f56" transparent
  CreateFont $SplashBodyFont "Segoe UI" 9 400
  SendMessage $1 ${WM_SETFONT} $SplashBodyFont 1

  ${NSD_CreateButton} 118u 108u 64u 20u "Install Vellum"
  Pop $SplashInstallButton
  SetCtlColors $SplashInstallButton "f7f6f1" "4a4035"
  CreateFont $SplashButtonFont "Segoe UI" 9 600
  SendMessage $SplashInstallButton ${WM_SETFONT} $SplashButtonFont 1
  ${NSD_OnClick} $SplashInstallButton SplashInstall

  ${NSD_CreateLabel} 76u 132u 148u 12u "Installs for your Windows account."
  Pop $1
  SetCtlColors $1 "807060" transparent
  SendMessage $1 ${WM_SETFONT} $SplashBodyFont 1

  ${If} $LANGUAGE == ${LANG_SPANISH}
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Se instala para tu cuenta de Windows."
    SendMessage $SplashInstallButton ${WM_SETTEXT} 0 "STR:Instalar Vellum"
  ${EndIf}

  ; The stock wizard controls must never leak into the splash.
  GetDlgItem $1 $HWNDPARENT 3
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 2
  ShowWindow $1 ${SW_HIDE}
  nsDialogs::Show
  ${NSD_FreeBitmap} $SplashBitmapHandle
FunctionEnd

Function SplashInstall
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd

Function SplashLeave
  GetDlgItem $1 $HWNDPARENT 2
  ShowWindow $1 ${SW_SHOW}
FunctionEnd

; Keep the real installation page for Tauri's sections, but reduce it to the
; same quiet visual language as the custom page. Progress control 1004 and the
; details/status controls are standard NSIS IDs.
Function StyleInstFilesPage
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1028
  SetCtlColors $0 "f7f6f1" "f7f6f1"
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 1256
  SetCtlColors $0 "f7f6f1" "f7f6f1"
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1006
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1007
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1004
  SendMessage $0 ${PBM_SETBARCOLOR} 0 0x35404A
  SetCtlColors $HWNDPARENT "4a4035" "f7f6f1"
FunctionEnd

Function .onInit
  InitPluginsDir
  !insertmacro ExtractSplashArtwork
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}
  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}
  !insertmacro SetContext
  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif
  Call RestorePreviousInstallLocation
FunctionEnd

Section WebView2
  ${If} $UpdateMode <> 1
    ${If} ${RunningX64}
      ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${Else}
      ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${EndIf}
    ${If} $4 == ""
      ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${EndIf}
    ${If} $4 == ""
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          ExecWait '"$TEMP\MicrosoftEdgeWebview2Setup.exe" ${WEBVIEW2INSTALLERARGS} /install' $1
        ${Else}
          Abort "WebView2 could not be downloaded."
        ${EndIf}
      !endif
      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        ExecWait '"$TEMP\MicrosoftEdgeWebview2Setup.exe" ${WEBVIEW2INSTALLERARGS} /install' $1
      !endif
      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        ExecWait '"$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" ${WEBVIEW2INSTALLERARGS} /install' $1
      !endif
      ${If} $1 <> 0
        Abort "WebView2 could not be installed."
      ${EndIf}
    ${EndIf}
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR
  Call MigrateLegacyMsi
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  File "${MAINBINARYSRCPATH}"
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"
  WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  ${If} $UpdateMode = 0
  ${AndIf} $NoShortcutMode = 0
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

Function .onInstSuccess
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  !insertmacro SetContext
  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}
  Delete "$INSTDIR\uninstall.exe"
  {{#each resources_ancestors}}
    RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"
  ${If} $UpdateMode = 0
    Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  DeleteRegKey HKCU "${UNINSTKEY}"
  ${If} $UpdateMode = 0
    DeleteRegKey HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 HKCU "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

; A release before ADR-0002 receives updates through the generic Windows key
; as an MSI. Remove that exact legacy product before NSIS writes its per-user
; installation, otherwise Windows would show two Vellum entries.
Function MigrateLegacyMsi
  StrCpy $0 0
  legacy_msi_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" legacy_msi_done
    IntOp $0 $0 + 1
    ReadRegStr $2 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $3 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$2$3" "${PRODUCTNAME}${MANUFACTURER}" 0 legacy_msi_loop
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $5 $4 "L"
    ${StrLoc} $6 $5 "msiexec" ">"
    StrCmp $6 "" legacy_msi_loop
    ClearErrors
    ExecWait '$4' $7
    ${IfThen} ${Errors} ${|} StrCpy $7 2 ${|}
    ${If} $7 <> 0
      MessageBox MB_ICONEXCLAMATION "Vellum's previous MSI installation could not be removed. No changes were made."
      Abort
    ${EndIf}
  legacy_msi_done:
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
FunctionEnd
