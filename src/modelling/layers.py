# src/modelling/layers.py

import torch
import torch.nn as nn

class SEBlock(nn.Module):
    """
    Squeeze-and-Excitation Block.
    Ajuda a rede a recalibrar as features, focando no que é importante.
    Muito útil em imagens médicas para destacar pequenas lesões.
    """
    def __init__(self, channel, reduction=16):
        super(SEBlock, self).__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Sequential(
            nn.Linear(channel, channel // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channel // reduction, channel, bias=False),
            nn.Sigmoid()
        )

    def forward(self, x):
        b, c, _, _ = x.size()
        y = self.avg_pool(x).view(b, c)
        y = self.fc(y).view(b, c, 1, 1)
        # Multiplica a feature original pela "importância" calculada (atenção)
        return x * y.expand_as(x)