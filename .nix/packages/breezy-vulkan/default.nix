{
  self,
  lib,
  stdenv,
  ...
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "breezy-vulkan";
  version = "unstable";

  src = "${self}/vulkan";

  dontBuild = true;

  installPhase = ''
    mkdir -p $out/bin
    echo 'echo "Hello, world"' >> $out/bin/${finalAttrs.pname}
    chmod +x $out/bin/${finalAttrs.pname}
  '';

  meta = {
    homepage = "https://github.com/wheaney/breezy-desktop";
    maintainers = with lib.maintainers; [shymega];
    platforms = lib.platforms.linux;
  };
})
