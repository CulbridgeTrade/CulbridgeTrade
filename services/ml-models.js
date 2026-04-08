install and integrae const tf = require('@tensorflow/tfjs-node');
const { pipeline } = require('@xenova/transformers');
const path = require('path');

/**
 * TensorFlow.js + PyTorch (ONNX) ML models
 */
class MLModels {
  constructor() {
    this.tfModel = null;
    this.ortSession = null;
  }

  async loadTensorFlowModel(modelPath = 'models/risk-model') {
    this.tfModel = await tf.loadLayersModel(`file://${path.join(__dirname, '..', modelPath)}/model.json`);
  }

  async predictRiskTensorFlow(features) {
    const tensor = tf.tensor2d([features]);
    const prediction = this.tfModel.predict(tensor);
    const risk = await prediction.data();
    tensor.dispose();
    prediction.dispose();
    return { risk: risk[0], model: 'tensorflow' };
  }

  async loadPyTorchModel(modelPath) {
    // PyTorch via ONNX Runtime
    const ort = require('onnxruntime-node');
    this.ortSession = await ort.InferenceSession.create(modelPath);
  }

  async predictRiskPyTorch(features) {
    const inputTensor = new ort.Tensor('float32', new Float32Array(features), [1, features.length]);
    const feeds = { input: inputTensor };
    const results = await this.ortSession.run(feeds);
    const risk = results.output.data[0];
    inputTensor.dispose();
    return { risk, model: 'pytorch-onnx' };
  }

  async ensemblePrediction(features) {
    const tfPred = await this.predictRiskTensorFlow(features);
    const ptPred = await this.predictRiskPyTorch(features);
    const ensemble = (tfPred.risk + ptPred.risk) / 2;
    return { ensemble_risk: ensemble, models: [tfPred, ptPred] };
  }
}

module.exports = MLModels;

