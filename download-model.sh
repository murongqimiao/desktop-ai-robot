#!/bin/bash

# ASR 模型下载脚本（支持中英文模型）

# 下载模型的函数
download_model() {
  local MODEL_NAME=$1
  local MODEL_URL=$2
  
  echo "正在下载 $MODEL_NAME..."
  
  # 检查是否已存在
  if [ -d "$MODEL_NAME" ]; then
    echo "模型目录已存在: $MODEL_NAME"
    read -p "是否重新下载？(y/N): " redo
    if [ "$redo" != "y" ] && [ "$redo" != "Y" ]; then
      echo "跳过下载 $MODEL_NAME"
      return 0
    fi
    rm -rf "$MODEL_NAME"
  fi
  
  # 下载模型
  echo "正在从 $MODEL_URL 下载..."
  if command -v wget &> /dev/null; then
    wget "$MODEL_URL" -O "${MODEL_NAME}.zip"
  elif command -v curl &> /dev/null; then
    curl -L "$MODEL_URL" -o "${MODEL_NAME}.zip"
  else
    echo "错误: 未找到 wget 或 curl，请手动下载:"
    echo "$MODEL_URL"
    return 1
  fi
  
  # 解压模型
  echo "正在解压模型..."
  if command -v unzip &> /dev/null; then
    unzip -q "${MODEL_NAME}.zip"
    rm "${MODEL_NAME}.zip"
    echo "✅ $MODEL_NAME 下载并解压完成！"
  else
    echo "错误: 未找到 unzip 命令，请手动解压 ${MODEL_NAME}.zip"
    return 1
  fi
}

echo "正在下载 Vosk 语音识别模型..."

# 创建模型目录
mkdir -p models
cd models

# 选择要下载的模型
echo ""
echo "请选择要下载的模型："
echo "1) 中文小型模型 (vosk-model-small-cn-0.22) - 约 40MB，性能优先"
echo "2) 中文中型模型 (vosk-model-cn-0.22) - 约 1.5GB，效果优先"
echo "3) 英文小型模型 (vosk-model-small-en-us-0.22) - 约 40MB，用于中英文混合识别"
echo "4) 同时下载中文和英文小型模型（推荐，支持中英文混合识别）"
read -p "请输入选项 (1-4，默认 1): " choice

case $choice in
  2)
    download_model "vosk-model-cn-0.22" "https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip"
    ;;
  3)
    download_model "vosk-model-small-en-us-0.22" "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.22.zip"
    ;;
  4)
    echo ""
    echo "正在下载中文和英文模型..."
    download_model "vosk-model-small-cn-0.22" "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
    download_model "vosk-model-small-en-us-0.22" "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.22.zip"
    echo ""
    echo "✅ 中英文模型下载完成！现在支持中英文混合识别。"
    cd ..
    echo ""
    echo "现在可以运行应用: npm start"
    exit 0
    ;;
  *)
    download_model "vosk-model-small-cn-0.22" "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
    ;;
esac

cd ..

echo ""
echo "✅ 模型设置完成！"
echo "提示: 要启用中英文混合识别，请运行此脚本并选择选项 4"
echo "现在可以运行应用: npm start"
