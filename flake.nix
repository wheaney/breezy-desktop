{
  description = "Nix Flake for breezy-desktop";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
    self.submodules = true;
  };
  outputs = inputs: let
    inherit (inputs) self nixpkgs flake-utils;

    forEachSystem = let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      genPkgs = system: nixpkgs.legacyPackages.${system};
      inherit (nixpkgs.lib) genAttrs;
    in
      f: genAttrs systems (system: f (genPkgs system));
  in {
    packages = forEachSystem (pkgs: {
      breezy-gnome = pkgs.callPackage ./.nix/packages/breezy-gnome {inherit self;};
      breezy-kde = pkgs.callPackage ./.nix/packages/breezy-kde {inherit self;};
      breezy-ui = pkgs.callPackage ./.nix/packages/breezy-ui {inherit self;};
      breezy-vulkan = pkgs.callPackage ./.nix/packages/breezy-vulkan {inherit self;};
      breezy-desktop = pkgs.symlinkJoin {
        name = "breezy-desktop";
        paths = with self.packages.${pkgs.stdenv.hostPlatform.system}; [
          breezy-gnome
          breezy-kde
          breezy-ui
          breezy-vulkan
        ];
      };
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.breezy-desktop;
    });

    devShells = forEachSystem (pkgs: {
      default = pkgs.mkShell {
        inputsFrom = with self.packages.${pkgs.stdenv.hostPlatform.system}; [default];
      };
    });
    overlays.default = final: _prev: {
      inherit
        (self.packages.${final.stdenv.hostPlatform.system})
        breezy-desktop
        breezy-gnome
        breezy-kde
        breezy-ui
        breezy-vulkan
        ;
    };
  };
}
