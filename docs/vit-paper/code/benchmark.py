"""Parameters, size, FLOPs and latency for ViT-B/16 vs MobileNetV2 (fine-tuned, 38 classes)."""
import json, time, io, sys
from pathlib import Path
import torch, timm

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\work\vit\out")
NAMES = {"vit": "vit_base_patch16_224.augreg_in21k_ft_in1k", "mnv2": "mobilenetv2_100.ra_in1k"}


def bench(model, dev, bs, iters, dtype=torch.float32):
    x = torch.randn(bs, 3, 224, 224, device=dev, dtype=dtype)
    model = model.to(dev).to(dtype).eval()
    with torch.no_grad():
        for _ in range(5): model(x)
        if dev == "cuda": torch.cuda.synchronize()
        t = time.perf_counter()
        for _ in range(iters): model(x)
        if dev == "cuda": torch.cuda.synchronize()
    return (time.perf_counter() - t) / iters * 1000


res = {}
for k, name in NAMES.items():
    m = timm.create_model(name, pretrained=False, num_classes=38).eval()
    buf = io.BytesIO(); torch.save(m.state_dict(), buf)
    r = {"params_M": sum(p.numel() for p in m.parameters()) / 1e6, "size_MB_fp32": buf.tell() / 1e6}
    try:
        from fvcore.nn import FlopCountAnalysis
        r["GFLOPs_MACs"] = FlopCountAnalysis(m, torch.randn(1, 3, 224, 224)).total() / 1e9
    except Exception:
        try:
            from thop import profile
            r["GMACs"] = profile(m, inputs=(torch.randn(1, 3, 224, 224),), verbose=False)[0] / 1e9
        except Exception as e:
            r["flops_error"] = str(e)
    torch.set_num_threads(4)
    r["cpu_latency_ms_bs1"] = bench(m, "cpu", 1, 20)
    if torch.cuda.is_available():
        r["gpu_latency_ms_bs1_fp32"] = bench(m, "cuda", 1, 100)
        r["gpu_latency_ms_bs1_fp16"] = bench(m, "cuda", 1, 100, torch.float16)
        r["gpu_throughput_img_s_bs64_fp16"] = 64 / bench(m, "cuda", 64, 20, torch.float16) * 1000
        r["gpu"] = torch.cuda.get_device_name(0)
    res[k] = r
    print(k, r, flush=True)
json.dump(res, open(OUT / "benchmark.json", "w"), indent=1)
