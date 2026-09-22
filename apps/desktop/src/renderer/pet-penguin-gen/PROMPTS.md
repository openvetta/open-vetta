# 桌宠企鹅视频生成说明

原白鼬桌宠是 **8 段循环 WebM 视频**（576×576、30fps、约 10 秒、VP9 透明），不是代码写的骨骼/Lottie。  
程序只负责循环播放、按时换动作。看起来掉帧，是因为中间版用了两张静帧硬切，不是原视频管线。

企鹅是黑白色，**必须绿幕**，不能用黑底（黑底会把羽毛抠掉）。

## 交付规格

- 画幅：1:1，建议 1024 或 720p，最后会缩到 576×576
- 时长：6–10 秒，首尾同一姿势，能无缝循环
- 帧率：30fps
- 镜头：锁死、不推拉、不摇
- 背景：整段保持纯绿幕，不要地面、不要影子铺到幕布上
- 角色：始终是 `canonical.jpg` 这只 3D 幼企鹅（圆头、大眼、橙嘴橙脚、黑头黑鳍、白肚）

## 怎么喂给视频模型

每个动作：

1. **首帧 = 尾帧** = `rest/<动作>.jpg`（无缝循环）
2. 身份参考 = `canonical.jpg`（有的工具叫 reference / images）
3. 可选中间关键帧 = `action/<动作>_*.jpg`（跳绳腾空、呼啦圈到腰、杠铃落下等）
4. 提示词用下面英文（视频模型对英文更稳）

生成后把 mp4/webm 发回来，或放到这个目录，文件名用表格里的「输出文件名」。

---

## 通用前缀（每条都带上）

```
Locked-off camera, seamless loop. Keep this exact cute 3D penguin: round oversized head, big glossy eyes, small orange beak, rosy cheeks, black head and flippers, white belly, orange webbed feet. The lime green chroma-key background stays perfectly flat and unchanged, no floor, no shadow on the backdrop.
```

## 分动作提示词

| 动作 | 首尾帧 | 可选中间帧 | 输出文件名 |
| --- | --- | --- | --- |
| 睡觉 | `rest/sleep.jpg` | `action/sleep_inhale.jpg` | `stoat_sleep_lie_on_cushion.webm` |
| 敲键盘 | `rest/work.jpg` | `action/work_blink.jpg` | `stoat_work_laptop_typing_desk_cushion.webm` |
| 喝茶 | `rest/tea.jpg` | `action/tea_sip.jpg` | `stoat_sit_cushion_drink_tea_slow.webm` |
| 听音乐 | `rest/listen.jpg` | `action/listen_nod.jpg` | `stoat_listen_music_headphones_nod.webm` |
| 呼啦圈 | `rest/hula.jpg` | `action/hula_waist.jpg` | `stoat_spin_color_hula_hoop.webm` |
| 跳绳 | `rest/skip.jpg` | `action/skip_jump.jpg` | `stoat_skip_rope_jump.webm` |
| 举杠铃 | `rest/barbell.jpg` | `action/barbell_down.jpg` | `stoat_stand_lift_barbell_one_hand_fast.webm` |
| 挥手 | `rest/wave.jpg` | `action/wave_up.jpg` | `stoat_wave_backflip_smoke_fade_exit.webm` |

### 睡觉

```
The penguin stays curled asleep on the grey cushion. Its chest and round belly rise about two centimeters as it inhales, then settle back down. Eyes stay closed. Slow breathing only.
```

### 敲键盘

```
The penguin sits in the bean-bag at the round table. Its flippers tap across the laptop keyboard, traveling a few centimeters left and right, and its head bobs two centimeters toward the screen then back. One short blink mid-loop.
```

### 喝茶

```
The penguin sits in the grey cushion holding the teacup. It lifts the cup four centimeters toward its beak, holds a sip, then lowers the cup back to the starting height.
```

### 听音乐

```
The penguin sits wearing headphones with eyes closed. Its whole body rocks six centimeters to the left, then six centimeters to the right, nodding to the beat, and returns to center.
```

### 呼啦圈

```
The rainbow hoop starts on the ground around the penguin's feet, then rises to the waist, spins around the belly two full turns, and drops back to the ground in the same place. The penguin's hips sway with the hoop.
```

### 跳绳

```
The penguin jumps rope. It hops up about one head-height off the ground and lands on the same spot; the grey rope makes a full rotation over the head and back to the ground in front of the feet. Repeat the jump twice.
```

### 举杠铃

```
The penguin stands holding the grey dumbbell. The raised flipper presses the dumbbell from shoulder height to full overhead, then lowers it back to the shoulder. One complete rep, then a second rep.
```

### 挥手

```
The penguin stands facing camera. Both flippers wave up above the head and back down, and the body bounces about four centimeters, then returns to the starting stance. Friendly wave, no backflip, no smoke, no disappearing.
```

---

## 生成时注意

- 绿幕要一直绿，不要变成灰色房间或黑底
- 不要换脸、不要加衣服、不要加字幕
- 跳绳/呼啦圈/杠铃必须有位移，不要原地轻微抖动
- 挥手不要做后空翻（原白鼬那条叫 wave_backflip，企鹅做成挥手循环即可）
