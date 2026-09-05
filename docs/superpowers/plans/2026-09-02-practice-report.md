# 大学生生成式人工智能应用社会实践报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在桌面生成一份正文不少于 3000 个汉字、A4 可编辑、无伪造调查数据和公章图像的 Word 社会实践报告。

**Architecture:** 报告正文和版式由一个任务内独立 Python 生成器负责，生成器只从代码内的已核验内容与文档契约构建 DOCX。独立验证脚本通过公开接口重新读取 DOCX，检查正文长度、章节、媒体数量、身份填写线和盖章空白页。

**Tech Stack:** Python 3.13、python-docx 1.2.0、pytest、Office Open XML。

## Global Constraints

- 输出文件固定为 `C:\Users\Lenovo\Desktop\大学生生成式人工智能应用社会实践报告.docx`。
- 正文至少 3000 个汉字，封面、参考资料、附件和单位鉴定页不计入正文。
- 研究方法写明为公开资料分析、规范文本解读和典型应用场景分析。
- 不得虚构问卷、访谈、观察、样本量、比例、实践单位评价、签名或公章。
- 文档不得包含任何图片形式的公章。
- 缺失身份信息使用可编辑填写线。
- 不修改仓库现有应用代码和用户未提交文件。

---

### Task 1: 定义报告模型和验证契约

**Files:**
- Create: `.trellis/tasks/09-02-practice-report/artifacts/practice_report_content.py`
- Create: `.trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`

**Interfaces:**
- Produces: `REPORT_TITLE: str`、`BODY_SECTIONS: list[tuple[str, list[str]]]`、`REFERENCES: list[str]`、`count_cjk(text: str) -> int`。
- Consumes: `.trellis/tasks/09-02-practice-report/prd.md` 与 `research/authoritative-sources.md` 中的内容边界。

- [ ] **Step 1: 写失败测试**

```python
from practice_report_content import BODY_SECTIONS, count_cjk

def test_body_has_at_least_3000_chinese_characters():
    body = "\n".join(
        paragraph
        for _, paragraphs in BODY_SECTIONS
        for paragraph in paragraphs
    )
    assert count_cjk(body) >= 3000

def test_body_does_not_claim_fabricated_fieldwork():
    body = "\n".join(
        paragraph
        for _, paragraphs in BODY_SECTIONS
        for paragraph in paragraphs
    )
    forbidden = ["发放问卷", "有效问卷", "受访者表示", "实地走访发现"]
    assert all(term not in body for term in forbidden)
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`

Expected: FAIL，提示 `practice_report_content` 不存在。

- [ ] **Step 3: 实现内容模型**

创建完整报告内容，章节固定为：绪论、研究设计与边界、主要应用场景、主要风险、成因分析、规范使用建议、专业视角下的能力提升、个人反思与结语。所有事实性政策表述可追溯至研究文件；不写无法核验的比例和样本结论。

- [ ] **Step 4: 运行内容测试**

Run: `pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`

Expected: PASS。

### Task 2: 生成 A4 Word 文档

**Files:**
- Create: `.trellis/tasks/09-02-practice-report/artifacts/generate_practice_report.py`
- Modify: `.trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`
- Create at runtime: `C:\Users\Lenovo\Desktop\大学生生成式人工智能应用社会实践报告.docx`

**Interfaces:**
- Consumes: Task 1 的 `REPORT_TITLE`、`BODY_SECTIONS` 和 `REFERENCES`。
- Produces: `build_report(output_path: Path) -> Path`。

- [ ] **Step 1: 写 DOCX 契约测试**

```python
from pathlib import Path
from docx import Document
from generate_practice_report import build_report

def test_generated_docx_contract(tmp_path: Path):
    output = build_report(tmp_path / "report.docx")
    document = Document(output)
    text = "\n".join(p.text for p in document.paragraphs)
    assert "大学生生成式人工智能工具应用现状、风险与规范使用研究" in text
    assert "研究方法与边界" in text
    assert "实践单位鉴定意见" in text
    assert len(document.inline_shapes) == 0
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`

Expected: FAIL，提示 `generate_practice_report` 不存在。

- [ ] **Step 3: 实现 Word 生成器**

生成器设置 A4 纵向、上下 2.54cm 和左右 3.0cm 页边距、宋体小四正文、黑体标题、1.5 倍行距、首行缩进、页脚页码。文档依次包含封面、摘要、正文、参考资料、资料检索记录、后续访谈提纲、照片粘贴位和实践单位鉴定页。鉴定页标注“本栏由实践单位填写并加盖真实公章”，只保留空白区域。

- [ ] **Step 4: 运行测试并生成桌面文件**

Run: `pytest -q .trellis/tasks/09-02-practice-report/artifacts/test_practice_report.py`

Expected: PASS。

Run: `python .trellis/tasks/09-02-practice-report/artifacts/generate_practice_report.py`

Expected: 输出桌面 DOCX 的绝对路径。

### Task 3: 验证成品并记录证据

**Files:**
- Create: `.trellis/tasks/09-02-practice-report/artifacts/verify_practice_report.py`
- Create: `.trellis/tasks/09-02-practice-report/verification.md`

**Interfaces:**
- Consumes: 桌面 DOCX。
- Produces: JSON 格式验证摘要，字段为 `path`、`body_cjk_count`、`required_sections`、`inline_shapes`、`media_files`、`zip_ok`。

- [ ] **Step 1: 实现验证器**

验证器用 `zipfile.ZipFile.testzip()` 检查容器，用 python-docx 读取段落和表格。正文计数只取“正文开始”与“正文结束”标记之间的段落；必需章节逐项断言；`inline_shapes` 与 `word/media/*` 均必须为 0。

- [ ] **Step 2: 运行验证器**

Run: `python .trellis/tasks/09-02-practice-report/artifacts/verify_practice_report.py`

Expected: `body_cjk_count >= 3000`、`inline_shapes = 0`、`media_files = 0`、`zip_ok = true`。

- [ ] **Step 3: 记录验证结果**

把命令、输出路径、正文汉字数、容器检查、章节检查和无图片结论写入 `.trellis/tasks/09-02-practice-report/verification.md`。
