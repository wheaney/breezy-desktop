{
  self,
  lib,
  pkgs,
  stdenv,
  fetchFromGitLab,
  libusb1,
  curl,
  openssl,
  libevdev,
  json_c,
  hidapi,
  wayland,
  cmake,
  pkg-config,
  python3,
  libffi,
  autoPatchelfHook,
  ...
}: let
  pythonEnv = python3.withPackages (ps: [ps.pyyaml]);
  buildInputs = [
    curl
    hidapi
    json_c
    libevdev
    libffi
    libusb1
    openssl
    stdenv.cc.cc.lib
    wayland
  ];
  arch =
    if pkgs.system == "aarch64-linux"
    then "aarch64"
    else if pkgs.system == "x86_64-linux"
    then "x86_64"
    else throw "Unsupported system ${pkgs.system}";
in
  stdenv.mkDerivation rec {
    pname = "xrlinuxdriver";
    version = "0.12.0.1";

    srcs = [
      (fetchFromGitLab rec {
        domain = "gitlab.com";
        owner = "TheJackiMonster";
        repo = "nrealAirLinuxDriver";
        rev = "3225fcc575e19a8407d5019903567cff1c3ed1a8";
        hash = "sha256-NRbcANt/CqREQZoYIYtTGVbvkZ7uo2Tm90s6prlsrQE=";
        fetchSubmodules = true;
        name = "${repo}-src";
      })
      (lib.cleanSourceWith {
        src = self;
        name = "${pname}-src";
      })
    ];
    sourceRoot = "${(builtins.elemAt srcs 1).name}";

    postUnpack = let
      nrealAirLinuxDriver = (builtins.elemAt srcs 0).name;
    in ''
      mkdir -p $sourceRoot/modules/xrealInterfaceLibrary
      cp -R ${nrealAirLinuxDriver}/* $sourceRoot/modules/xrealInterfaceLibrary
      chmod -R u+w $sourceRoot
    '';

    nativeBuildInputs = [
      cmake
      pkg-config
      pythonEnv
      autoPatchelfHook
    ];
    inherit buildInputs;

    cmakeFlags = [
      "-DCMAKE_SKIP_RPATH=ON"
    ];
    cmakeBuildDir = "build";
    cmakeBuildType = "RelWithDebInfo";

    installPhase = ''
      mkdir -p $out/bin $out/usr/lib/systemd/user $out/usr/lib/udev/rules.d $out/usr/lib/${arch}
      cp xrDriver ../bin/xr_driver_cli ../bin/xr_driver_verify $out/bin
      cp ../udev/* $out/usr/lib/udev/rules.d/
      cp ../lib/${arch}/* $out/usr/lib/${arch}/
      cp ../systemd/xr-driver.service $out/usr/lib/systemd/user/
      cp ${hidapi}/lib/libhidapi-hidraw.so.0 $out/usr/lib/
    '';

    preBuild = ''
      addAutoPatchelfSearchPath $out/usr/lib/${arch}
    '';

    postInstall = ''
      substituteInPlace $out/usr/lib/systemd/user/xr-driver.service \
        --replace-fail "ExecStart={bin_dir}/xrDriver" "ExecStart=$out/bin/xrDriver" \
        --replace-fail "{ld_library_path}" "$out/usr/lib/${arch}"
    '';

    doInstallCheck = false;
    # The default release is a script which will do an impure download
    # just ensure that the application can run without network

    meta = with lib; {
      homepage = "https://github.com/wheaney/XRLinuxDriver";
      license = licenses.mit;
      description = "Linux service for interacting with XR devices.";
      mainProgram = "xrDriver";
      maintainers = with maintainers; [shymega];
      platforms = platforms.linux;
    };
  }
