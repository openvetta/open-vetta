import { LOTTIE_DIR } from "./constants";

// The tool description is the prompt-engineering core: it teaches the agent how
// to author valid bodymovin JSON, where to put it, and the slot conventions
// that make the animation editable in the preview panel. Distilled from the
// upstream text-to-lottie skill (diffusionstudio/lottie).

export const SAVE_TOOL_DESCRIPTION = `把一个 Lottie（Bodymovin）动画保存为可在侧边「Lottie Studio」面板实时预览与编辑的 .lottie 文件。

何时调用：用户要求创建 / 生成 / 修改 / 修复一个 Lottie 动画，或要一个「动画」时。

工作流（重要）：
1. 先用你的文件写入工具，把【完整的 bodymovin JSON】写成一个草稿文件，路径形如 ./${LOTTIE_DIR}/<英文短横线名>.draft.json。不要把整段 JSON 作为本工具的参数内联传入——只传文件路径，省 token 也更可靠。
2. 然后调用本工具，sourcePath 传上面那个草稿的【绝对路径】，name 传动画的人类可读名称。本工具会校验 JSON、落盘为 ./${LOTTIE_DIR}/<slug>.lottie、删除草稿，并自动打开预览面板。

修改现有动画：.lottie 文件本身就是 JSON 文本，直接用你的读取工具读它、改它，把结果写成新的草稿 .json，再调用本工具并把 outputPath 设为那个已存在的 .lottie 的绝对路径即可覆盖。改之前务必重新读盘——用户可能已在面板里拖动滑块改过属性。

bodymovin 文档要点：
- 顶层必须有 v（版本，slot 需要 >= "5.11.0"）、fr（帧率）、ip/op（起止帧）、w/h（画布宽高）、layers（图层数组）。
- 缓动：避免纯 linear；关键帧用 i/o 贝塞尔手柄做 ease-in/out，注意节奏与转场。
- 复杂或程序化的动画，先写脚本生成 JSON 再写入草稿。

可调属性（slots）——本插件的核心特色：
- 在顶层加 "slots" 映射，把希望用户能调的属性做成 slot；属性对象上加 "sid" 指向 slot id，值取自该 slot。
- 类型与面板控件对应：color（RGBA，各通道 0..1）→ 取色器；scalar → 滑块/数字；vec2 [x,y] → 两个数字；text → 文本框。
- 【硬性规则】每个动画至少暴露一个「背景色」color slot。
- 可选：在顶层 metadata.lottieStudio.controls 里为 slot 补充 UI 提示，形如 [{ "sid": "speed", "label": "速度", "min": 0, "max": 3, "step": 0.1 }]，scalar slot 给了 min/max 才会显示滑块。

规范参考：https://lottie.github.io/lottie-spec/`;

// A compact, structurally-correct few-shot: a ball drops and bounces on a
// slotted background color, with one extra scalar slot. Embedded in the tool
// description's companion guidance so the agent has a concrete template.
export const FEW_SHOT_EXAMPLE = `示例（弹跳小球，含背景色 slot 与一个 scalar slot）：
{
  "v": "5.11.0", "fr": 60, "ip": 0, "op": 90, "w": 400, "h": 400, "nm": "bounce",
  "slots": {
    "bgColor": { "p": { "a": 0, "k": [0.06, 0.07, 0.11, 1] } },
    "ballColor": { "p": { "a": 0, "k": [0.39, 0.4, 0.96, 1] } }
  },
  "metadata": { "lottieStudio": { "controls": [
    { "sid": "bgColor", "label": "背景色" },
    { "sid": "ballColor", "label": "小球颜色" }
  ] } },
  "layers": [
    { "ddd": 0, "ind": 1, "ty": 4, "nm": "bg", "ks": { "o": {"a":0,"k":100}, "p": {"a":0,"k":[200,200]}, "a": {"a":0,"k":[200,200]}, "s": {"a":0,"k":[100,100]} },
      "shapes": [ { "ty":"rc", "p":{"a":0,"k":[200,200]}, "s":{"a":0,"k":[400,400]}, "r":{"a":0,"k":0} },
                  { "ty":"fl", "c": {"a":0,"k":[0.06,0.07,0.11,1], "sid":"bgColor"}, "o":{"a":0,"k":100} } ], "ip":0, "op":90 },
    { "ddd": 0, "ind": 2, "ty": 4, "nm": "ball",
      "ks": { "o": {"a":0,"k":100}, "a": {"a":0,"k":[0,0]}, "s": {"a":0,"k":[100,100]},
        "p": { "a": 1, "k": [
          { "t": 0,  "s": [200, 80],  "i": {"x":[0.6],"y":[1]}, "o": {"x":[0.4],"y":[0]} },
          { "t": 45, "s": [200, 320], "i": {"x":[0.6],"y":[1]}, "o": {"x":[0.4],"y":[0]} },
          { "t": 90, "s": [200, 80] }
        ] } },
      "shapes": [ { "ty":"el", "p":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[64,64]} },
                  { "ty":"fl", "c": {"a":0,"k":[0.39,0.4,0.96,1], "sid":"ballColor"}, "o":{"a":0,"k":100} } ], "ip":0, "op":90 }
  ]
}`;
