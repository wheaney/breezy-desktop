{
  self,
  lib,
  stdenv,
  glib,
  gnome-shell,
  ...
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "breezy-gnome";
  version = "unstable";

  src = "${self}/gnome/src";

  buildInputs = [
    glib
  ];

  passthru = {
    extensionUuid = "breezydesktop@xronlinux.com";
  };

  buildPhase = ''
    runHook preBuild

    glib-compile-schemas schemas

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    extensions_dir="$out/share/gnome-shell/extensions/${finalAttrs.passthru.extensionUuid}"
    mkdir -p "$extensions_dir"

    cp -RLv $src/{schemas,*.js,*.frag,metadata.json,dbus-interfaces,textures} "$extensions_dir"

    runHook postInstall
  '';

  meta = {
    homepage = "https://github.com/wheaney/breezy-desktop";
    maintainers = with lib.maintainers; [shymega];
    platforms = lib.platforms.linux;
  };
})

