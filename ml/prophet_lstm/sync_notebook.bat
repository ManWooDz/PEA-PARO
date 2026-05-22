@echo off
cd /d "%~dp0"
python -c "import jupytext,pathlib; nb=jupytext.reads(pathlib.Path('notebook_source.py').read_text(encoding='utf-8'),fmt='py:percent'); jupytext.write(nb,'Prophet_LSTM_IslandC.ipynb')"
git add notebook_source.py Prophet_LSTM_IslandC.ipynb src/
git commit -m "chore: sync notebook from source"
git push origin master
echo Done! ใน Colab Cell 2 จะ git pull อัตโนมัติเพื่อให้ src/ ล่าสุดเสมอ
pause
