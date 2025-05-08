{
  self,
  lib,
  stdenv,
  glib,
  ...
}: stdenv.mkDerivation rec {
    pname = "breezy-gnome";
    version = "unstable";

    src = lib.cleanSource "${self}/gnome/src/.";

    buildInputs = [
      glib
    ];

    passthru = {
      extensionUuid = "breezydesktop@xronlinux.com";
    };

    buildPhase = ''
      mkdir -p build/schemas
      glib-compile-schemas --targetdir="build/schemas" $src/schemas/

      cp $src/*.js build/
      cp $src/*.frag build/
      mkdir -p build/schemas/
      cp $src/schemas/*.xml build/schemas/
      mkdir -p build/dbus-interfaces/
      cp $src/dbus-interfaces/*.xml build/dbus-interfaces/
      mkdir -p build/textures/
      cp -rL $src/textures/* build/textures/
      cp $src/metadata.json build/
    '';

    installPhase = ''
      extra_source=()
      for file in "$DEST_DIR"/*; do
          extra_source+=("--extra-source=$file")
      done

      gnome-extensions pack --force "$${extra_source[@]}" "build" -o "$out"
    '';

    doInstallCheck = false;
    # The default release is a script which will do an impure download
    # just ensure that the application can run without network

    meta = with lib; {
      homepage = "https://github.com/wheaney/breezy-desktop";
      maintainers = with maintainers; [shymega];
      platforms = platforms.linux;
    };
  }
