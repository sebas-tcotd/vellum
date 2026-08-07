VELLUM — macOS install notes / Notas de instalación

English
-------
1. Drag Vellum.app into the Applications folder shown in this window.
2. Vellum v1 is not notarized by Apple. The first time you open it, macOS
   Gatekeeper will refuse to launch it unless you clear the quarantine flag.
   Open Terminal and run:

       xattr -cr /Applications/Vellum.app

3. Launch Vellum from Applications or Spotlight.

Español
-------
1. Arrastra Vellum.app a la carpeta Aplicaciones que se muestra en esta ventana.
2. La v1 de Vellum no está notarizada por Apple. La primera vez que la abras,
   Gatekeeper de macOS se negará a iniciarla salvo que quites el flag de
   cuarentena. Abre Terminal y ejecuta:

       xattr -cr /Applications/Vellum.app

3. Abre Vellum desde Aplicaciones o Spotlight.
