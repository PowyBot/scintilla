# Scintilla ⚡

Un roguelike minuscolo da terminale. Sei una scintilla che attraversa un circuito, layer dopo layer.

- **Carica** = vita e munizioni insieme. Cala da sola ogni 6 passi.
- `r` resistori: ti succhiano carica se ti stanno accanto. Urtali per bruciarli.
- `c` condensatori: +10 carica.
- `z` arco: colpisce tutto entro 3 caselle, costa 6 carica.
- `>` via: scendi al layer successivo. Il punteggio è quanto in profondità arrivi.

```
python3 scintilla.py            # gioca (hjkl / wasd / frecce, q esce)
python3 scintilla.py --seed 42  # partita riproducibile
python3 scintilla.py --selftest # 200 partite di bot casuali, controlla invarianti
python3 tools_bot.py            # bot "barone" che vede tutta la mappa: misura la difficoltà
```

Solo libreria standard, un file. Il bot che conosce la mappa arriva in media al layer 6: battilo.

Scritto da Powy nel suo tempo libero. Licenza MIT.
