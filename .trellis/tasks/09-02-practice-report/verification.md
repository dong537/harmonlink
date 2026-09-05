# 实践报告生成与验证记录

## 状态

`DONE_WITH_CONCERNS`

文档生成、自动测试和独立结构验证均已完成。残余关注点是当前环境未使用 Microsoft Word GUI 做逐页渲染目检；如果学校要求真实访谈、现场观察、照片或单位鉴定，学生仍须实际完成并据实补充，本报告不会代替这些材料。

## 交付物

- 输出文件：`C:\Users\Lenovo\Desktop\大学生生成式人工智能应用社会实践报告.docx`
- 文件大小：49,556 字节
- SHA-256：`06EB3E01D105C3D108601376587D33E005931DF6E04784A85C615251CC99C266`
- 生成环境：Python 3.13.12，python-docx 1.2.0，pytest 9.1.1

## TDD 证据

### RED 1：内容模型

命令：

```powershell
rtk pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py -k "content_model or references or count_cjk"
```

结果：退出码 1，4 项失败；失败原因为 `practice_report_content` 模块尚不存在，符合预期。

### GREEN 1：内容模型

同一命令结果：退出码 0，4 项通过。验证标题、十个正文章节、正文汉字下限、方法与证据边界、禁用虚构式表述、参考资料字段和 CJK 计数。

### RED 2：Word 生成器

命令：

```powershell
rtk pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py -k "generated_docx"
```

结果：退出码 1，4 项失败；失败原因为 `generate_practice_report` 模块尚不存在，符合预期。

### GREEN 2：Word 生成器

命令：

```powershell
rtk pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py
```

第一次结果：7 项通过、1 项失败。失败来自测试以小于一个 OOXML twip 的容差比较 A4 尺寸；将断言修正为 `0.01 cm` 序列化容差后，第二次结果为退出码 0、8 项通过。A4 标准及页边距数值没有放宽。

### RED 3：独立验证器

命令：

```powershell
rtk pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py -k independent_verifier
```

结果：退出码 1，1 项失败；失败原因为 `verify_practice_report` 模块尚不存在，符合预期。

### RED 4：样式验证摘要

同一命令在验证器首次实现后再次运行，结果为退出码 1，1 项失败；失败原因为验证摘要尚无 `style_contract` 字段。补充从磁盘重读样式的验证后进入 GREEN。

### 最终 GREEN

命令：

```powershell
rtk pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py
```

结果：退出码 0，9 项全部通过。

## 生成与独立验证

生成命令：

```powershell
rtk python .trellis/tasks/09-02-practice-report/artifacts/generate_practice_report.py
```

结果：退出码 0，输出固定桌面路径。

独立验证命令：

```powershell
rtk python .trellis/tasks/09-02-practice-report/artifacts/verify_practice_report.py
```

验证结果：

- 正文汉字数：6,102（仅统计“正文开始”与“正文结束”标记之间内容）
- 必需章节：17 项全部存在，包括摘要、十个正文章节、参考资料、过程材料附页与实践单位鉴定页
- ZIP 容器：完整，`zip_ok = true`
- python-docx 重读：成功
- 页面：A4 纵向，上下边距 2.54 cm，左右边距 3.0 cm
- 样式：宋体 12 磅正文、黑体 16 磅一级标题、1.5 倍行距、24 磅首行缩进
- 页码域：存在
- 研究方法与证据边界：存在
- 单位意见、负责人签字、日期和盖章区域：保持空白
- 内嵌图片：0
- `word/media/*` 文件：0

编译检查：

```powershell
rtk python -m compileall -q .trellis/tasks/09-02-practice-report/artifacts
```

结果：退出码 0。

## 提交前人工事项

- 据实填写学校、姓名、学号、班级、实践单位和实践日期。
- 核对课程是否接受公开资料与规范文本分析作为本次实践形式。
- 只有真实开展后才能补充访谈记录和照片；只有真实实践单位可以填写鉴定、签字并盖章。
- 在 Microsoft Word 中打开后检查本机字体替换、分页和打印预览。
