package main

import (
    "fmt"
    "os/exec"

    "fyne.io/fyne/v2"
    "fyne.io/fyne/v2/app"
    "fyne.io/fyne/v2/widget"
)

func main() {
    a := app.New()
    w := a.NewWindow("Button-Programm")
    w.Resize(fyne.NewSize(100, 600))

    button := widget.NewButton("Gartentüre öffnen", func() {
        cmd := exec.Command("curl", "http://www.test.at")
        err := cmd.Run()
        if err != nil {
            fmt.Println(err)
        }
    })

    button.Resize(fyne.NewSize(100, 600))
    w.SetContent(button)
    w.ShowAndRun()
}
