#!/bin/bash

# ASR 中文模型下载脚本

echo "正在下载 Vosk 中文语音识别模型..."

# 创建模型目录
mkdir -p models
cd models

# 选择模型大小
echo "请选择要下载的模型："
echo "1) 小型模型 (vosk-model-small-cn-0.22) - 约 40MB，性能优先"
echo "2) 中型模型 (vosk-model-cn-0.22) - 约 1.5GB，效果优先"
read -p "请输入选项 (1 或 2，默认 1): " choice

case $choice in
  2)
    MODEL_NAME="vosk-model-cn-0.22"
    MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip"
    ;;
  *)
    MODEL_NAME="vosk-model-small-cn-0.22"
    MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
    ;;
esac

echo "正在下载 $MODEL_NAME..."

# 检查是否已存在
if [ -d "$MODEL_NAME" ]; then
  echo "模型目录已存在: $MODEL_NAME"
  read -p "是否重新下载？(y/N): " redo
  if [ "$redo" != "y" ] && [ "$redo" != "Y" ]; then
    echo "跳过下载"
    exit 0
  fi
  rm -rf "$MODEL_NAME"
fi

# 下载模型
if command -v wget &> /dev/null; then
  wget "$MODEL_URL" -O "${MODEL_NAME}.zip"
elif command -v curl &> /dev/null; then
  curl -L "$MODEL_URL" -o "${MODEL_NAME}.zip"
else
  echo "错误: 未找到 wget 或 curl，请手动下载:"
  echo "$MODEL_URL"
  exit 1
fi

# 解压模型
echo "正在解压模型..."
if command -v unzip &> /dev/null; then
  unzip -q "${MODEL_NAME}.zip"
  rm "${MODEL_NAME}.zip"
  echo "模型下载并解压完成！"
  echo "模型路径: models/$MODEL_NAME"
else
  echo "错误: 未找到 unzip 命令，请手动解压 ${MODEL_NAME}.zip"
  exit 1
fi

cd ..

echo ""
echo "✅ 模型设置完成！"
echo "现在可以运行应用: npm start"

