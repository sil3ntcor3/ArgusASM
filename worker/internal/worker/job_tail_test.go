package worker

import (
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestTailBufferConcurrentAccess(t *testing.T) {
	const writers, readers, iterations = 4, 4, 1000
	var tail tailBuffer
	var wg sync.WaitGroup
	start := make(chan struct{})
	wg.Add(writers + readers)
	for writer := 0; writer < writers; writer++ {
		go func(writer int) {
			defer wg.Done()
			<-start
			for line := 0; line < iterations; line++ {
				tail.append(fmt.Sprintf("writer-%d line-%d", writer, line))
			}
		}(writer)
	}
	for reader := 0; reader < readers; reader++ {
		go func() {
			defer wg.Done()
			<-start
			for read := 0; read < iterations; read++ {
				_ = tail.String()
			}
		}()
	}
	close(start)
	wg.Wait()

	tail.append("final log line")
	lines := strings.Split(tail.String(), "\n")
	if len(lines) != tailMaxLines {
		t.Errorf("got %d lines after concurrent appends, want %d", len(lines), tailMaxLines)
	}
	if lines[len(lines)-1] != "final log line" {
		t.Errorf("last line = %q, want final log line", lines[len(lines)-1])
	}
}
