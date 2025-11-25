# src/modelling/models.py

import torch
import torch.nn as nn
from torchvision import models

class MammographyClassifier(nn.Module):
    """
    Modelo Classificador para BI-RADS.
    Suporta backbones ResNet e DenseNet pré-treinados no ImageNet.
    """
    def __init__(self, backbone='resnet50', num_classes=5, pretrained=True):
        super(MammographyClassifier, self).__init__()
        
        self.backbone_name = backbone
        
        # 1. Carregar o Backbone (Esqueleto da rede)
        if backbone == 'resnet50':
            # Carrega a ResNet50 com pesos do ImageNet (Transfer Learning)
            weights = models.ResNet50_Weights.DEFAULT if pretrained else None
            self.model = models.resnet50(weights=weights)
            
            # Armazena o número de features da última camada antes da classificação
            num_ftrs = self.model.fc.in_features
            
            # Opcional: Adaptar primeira camada se a imagem for Grayscale (1 canal) em vez de RGB (3)
            # self.model.conv1 = nn.Conv2d(1, 64, kernel_size=7, stride=2, padding=3, bias=False)
            
            # Substitui a última camada (Head) para o nosso número de classes BI-RADS
            self.model.fc = nn.Linear(num_ftrs, num_classes)

        elif backbone == 'densenet121':
            # DenseNet é excelente para imagens médicas (reuso de features)
            weights = models.DenseNet121_Weights.DEFAULT if pretrained else None
            self.model = models.densenet121(weights=weights)
            
            num_ftrs = self.model.classifier.in_features
            
            # Opcional: Adaptar primeira camada para Grayscale
            # self.model.features.conv0 = nn.Conv2d(1, 64, kernel_size=7, stride=2, padding=3, bias=False)
            
            # Substitui a última camada
            self.model.classifier = nn.Linear(num_ftrs, num_classes)
            
        else:
            raise ValueError(f"Backbone '{backbone}' não suportado. Use 'resnet50' ou 'densenet121'.")

    def forward(self, x):
        return self.model(x)

    def freeze_layers(self):
        """
        Congela os pesos do backbone para treinar apenas a última camada (Fine-tuning rápido).
        """
        for param in self.model.parameters():
            param.requires_grad = False
            
        # Descongela apenas a última camada (classificador)
        if self.backbone_name == 'resnet50':
            for param in self.model.fc.parameters():
                param.requires_grad = True
        elif self.backbone_name == 'densenet121':
            for param in self.model.classifier.parameters():
                param.requires_grad = True

# Exemplo de uso (para você testar):
if __name__ == "__main__":
    # Cria um modelo DenseNet para classificar em 5 categorias BI-RADS
    net = MammographyClassifier(backbone='densenet121', num_classes=5)
    
    # Simula uma imagem de entrada (Batch=1, Canais=3, Altura=224, Largura=224)
    dummy_input = torch.randn(1, 3, 224, 224)
    
    # Passa a imagem pela rede
    output = net(dummy_input)
    print(f"Output shape: {output.shape}") # Deve ser [1, 5]