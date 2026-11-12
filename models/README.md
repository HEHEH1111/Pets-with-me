# Photo cutout model

The local photo editor uses the lightweight U²-Net saliency model by Xuebin Qin and collaborators. The supplied ONNX conversion is distributed with rembg. No input photographs are included.

- [Original model and paper](https://github.com/xuebinqin/U-2-Net)
- [ONNX model distribution](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx)
- [Reference preprocessing and checksum](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py)
- Verified model MD5: `8e83ca70e441ab06c318d82300c84806`.
- U²-Net license: see LICENSE-U2NET. ONNX Runtime is distributed under the MIT license; its notices are bundled beside the runtime.
