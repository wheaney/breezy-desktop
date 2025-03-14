{
  description = "Nix Flake for Breezy Desktop";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
    xrlinuxdriver.url = "git+https://github.com/shymega/XRLinuxDriver?ref=shymega/nix-flake-support"; 
    self.submodules = true;
  };
  outputs =
    inputs:
    let
      inherit (inputs) self nixpkgs flake-utils;

      forEachSystem =
        let
          systems = [
            "x86_64-linux"
            "aarch64-linux"
          ];
          genPkgs = system: nixpkgs.legacyPackages.${system};
          inherit (nixpkgs.lib) genAttrs;
        in
        f: genAttrs systems (system: f (genPkgs system));
    in
    {
      packages = forEachSystem (
        pkgs:
        let
          version = builtins.readFile "${self}/VERSION";
        in
        {
          breezy-gnome = pkgs.callPackage ./.nix/packages/breezy-gnome { inherit self version; };
          breezy-kde = pkgs.callPackage ./.nix/packages/breezy-kde { inherit self version; };
          breezy-ui = pkgs.callPackage ./.nix/packages/breezy-ui { inherit self version; };
          breezy-vulkan = pkgs.callPackage ./.nix/packages/breezy-vulkan { inherit self version; };
          breezy-desktop = pkgs.symlinkJoin {
            name = "breezy-desktop";
            paths = with self.packages.${pkgs.stdenv.hostPlatform.system}; [
              breezy-gnome
              breezy-kde
              breezy-ui
              breezy-vulkan
            ] ++ (with inputs.xrlinuxdriver.packages.${pkgs.stdenv.hostPlatform.system}; [
              xrlinuxdriver
            ]);
            meta.mainProgram = "breezydesktop";
          };
          default = self.packages.${pkgs.stdenv.hostPlatform.system}.breezy-desktop;
        }
      );

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          inputsFrom = with self.packages.${pkgs.stdenv.hostPlatform.system}; [ default ];
        };
      });
      overlays.default = _: prev: self.packages.${prev.stdenv.hostPlatform.system};
    };
}
