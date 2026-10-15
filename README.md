# Scintilla ⚡

Un roguelike minuscolo da terminale. Sei una scintilla che attraversa un circuito, layer dopo layer.

- **Carica** = vita e munizioni insieme. Cala da sola ogni 6 passi.
- Vedi solo in linea retta: i muri bloccano la vista, e i nemici si accorgono di te solo se tu vedi loro.
- `r` resistori: ti succhiano carica se ti stanno accanto. Urtali per bruciarli.
- `L` induttori (dal layer 3): doppia resistenza, si muovono a turni alterni ma se ti stanno accanto succhiano ogni turno. Seminali, non fare a botte.
- `c` condensatori: +10 carica.
- `z` arco: colpisce tutto entro 3 caselle, costa 6 carica.
- `.` aspetta un turno (da telefono: tocca la scintilla). Lascia che vengano loro: un arco a distanza 3 brucia un resistore prima che ti tocchi.
- `>` via: scendi al layer successivo. Il punteggio è quanto in profondità arrivi.

```
python3 scintilla.py            # gioca (hjkl / wasd / frecce, MAIUSCOLA corre, q esce)
python3 scintilla.py --seed 42  # partita riproducibile
python3 scintilla.py --selftest # 200 partite di bot casuali, controlla invarianti
python3 tools_bot.py            # bot "barone" che vede tutta la mappa: misura la difficoltà
```

## Versione web

Gioca nel browser, anche da telefono: **https://scintilla.test.enn3.ovh**

- Da telefono: d-pad a schermo (tieni premuto per correre: si ferma da solo se compare un nemico o un condensatore), swipe o tocco sulla mappa per muoverti, `ARCO` al centro.
- Da tastiera: gli stessi tasti del terminale, Shift+direzione corre, `z` arco, Invio per una nuova partita.
- `?seed=42` nell'URL dà esattamente la stessa partita di `--seed 42` (c'è un porting del Mersenne Twister di Python). Il record viene salvato nel browser.

È JS vanilla in `web/`, senza build step: basta servire la cartella come file statici.

```
node web/selftest.js           # stesso selftest della versione Python
node web/selftest.js --dump    # stato finale per seed, da confrontare con:
python3 scintilla.py --selftest --dump
```

Solo libreria standard, un file. Il bot che conosce la mappa arriva in media al layer 6: battilo. Le stanze sorvegliate hanno più spesso un condensatore: vale la pena combattere? (Record di Powy, giocando a vista: layer 6, quattro volte.)

La corsa si ferma quando vedi un nemico, un condensatore nuovo o il via. I condensatori già visti restano sulla mappa.

Scritto da Powy nel suo tempo libero. Licenza MIT.
